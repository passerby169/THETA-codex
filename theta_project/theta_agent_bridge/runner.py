from __future__ import annotations

import json
import os
import queue
import signal
import subprocess
import sys
import threading
import time
from pathlib import Path
from typing import Any

from .bridge import (
    PROJECT_ROOT,
    connect_state_db,
    init_state_db,
    record_event,
    utc_now_iso,
)


POLL_INTERVAL_SECONDS = 1.0
TERMINATE_TIMEOUT_SECONDS = 10


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python -m theta_agent_bridge.runner <training_run_id>")
    training_run_id = sys.argv[1]
    run_training(training_run_id)


def run_training(training_run_id: str) -> None:
    run = fetch_run(training_run_id)
    if run is None:
        raise SystemExit(f"Unknown training_run_id: {training_run_id}")

    commands = json.loads(run["command_json"])
    log_path = Path(run["log_path"])
    log_path.parent.mkdir(parents=True, exist_ok=True)

    with log_path.open("a", encoding="utf-8", errors="replace") as log:
        write_log(log, f"[runner] started run={training_run_id} pid={os.getpid()}")
        mark_running(training_run_id, "prepare_data", 5)
        try:
            for index, command in enumerate(commands):
                if is_cancel_requested(training_run_id):
                    mark_cancelled(training_run_id, "Cancellation requested before next command.")
                    write_log(log, "[runner] cancelled before next command")
                    return

                step = str(command.get("step") or f"step_{index + 1}")
                progress = 10 if index == 0 else 55
                mark_running(training_run_id, step, progress)
                write_log(log, f"[runner] step={step}")
                code = run_command(training_run_id, command, log)
                if code == "cancelled":
                    mark_cancelled(training_run_id, f"Cancelled during {step}.")
                    write_log(log, f"[runner] cancelled during {step}")
                    return
                if isinstance(code, int) and code != 0:
                    message = f"Command failed with exit code {code}: {' '.join(command_argv(command))}"
                    mark_failed(training_run_id, step, message)
                    write_log(log, f"[runner] failed: {message}")
                    return

            mark_completed(training_run_id)
            write_log(log, "[runner] completed")
        except Exception as exc:
            mark_failed(training_run_id, "runner", str(exc))
            write_log(log, f"[runner] failed: {exc}")
            raise


def run_command(training_run_id: str, command: dict[str, Any], log) -> int | str:
    argv = command_argv(command)
    cwd = Path(str(command.get("cwd") or PROJECT_ROOT))
    write_log(log, "[run] " + " ".join(argv))

    kwargs: dict[str, Any] = {
        "cwd": str(cwd),
        "stdout": subprocess.PIPE,
        "stderr": subprocess.STDOUT,
        "stdin": subprocess.DEVNULL,
        "text": True,
        "encoding": "utf-8",
        "errors": "replace",
    }
    if os.name == "nt":
        kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP
    else:
        kwargs["start_new_session"] = True

    process = subprocess.Popen(argv, **kwargs)
    output_queue: queue.Queue[str | None] = queue.Queue()
    reader = threading.Thread(target=read_stdout, args=(process, output_queue), daemon=True)
    reader.start()

    while True:
        drain_output(output_queue, log)
        if is_cancel_requested(training_run_id):
            terminate_process(process, log)
            drain_output(output_queue, log)
            return "cancelled"

        code = process.poll()
        if code is not None:
            reader.join(timeout=2)
            drain_output(output_queue, log)
            return int(code)

        time.sleep(POLL_INTERVAL_SECONDS)


def command_argv(command: dict[str, Any]) -> list[str]:
    argv = [str(value) for value in command.get("argv") or []]
    if argv and argv[0] == "python":
        argv[0] = sys.executable
    return argv


def read_stdout(process: subprocess.Popen, output_queue: queue.Queue[str | None]) -> None:
    assert process.stdout is not None
    for line in process.stdout:
        output_queue.put(line)
    output_queue.put(None)


def drain_output(output_queue: queue.Queue[str | None], log) -> None:
    while True:
        try:
            line = output_queue.get_nowait()
        except queue.Empty:
            return
        if line is None:
            continue
        log.write(line)
        log.flush()


def terminate_process(process: subprocess.Popen, log) -> None:
    write_log(log, f"[runner] terminating child pid={process.pid}")
    try:
        if os.name == "nt":
            try:
                process.send_signal(signal.CTRL_BREAK_EVENT)
            except Exception:
                process.terminate()
        else:
            os.killpg(process.pid, signal.SIGTERM)
        process.wait(timeout=TERMINATE_TIMEOUT_SECONDS)
        return
    except Exception as exc:
        write_log(log, f"[runner] graceful termination failed: {exc}")

    try:
        if os.name == "nt":
            subprocess.run(
                ["taskkill", "/PID", str(process.pid), "/T", "/F"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                check=False,
            )
        else:
            os.killpg(process.pid, signal.SIGKILL)
    except Exception as exc:
        write_log(log, f"[runner] forced termination failed: {exc}")


def fetch_run(training_run_id: str):
    with connect_state_db() as conn:
        init_state_db(conn)
        return conn.execute(
            """
            SELECT training_run_id, status, command_json, log_path
            FROM training_runs
            WHERE training_run_id = ?
            """,
            (training_run_id,),
        ).fetchone()


def is_cancel_requested(training_run_id: str) -> bool:
    with connect_state_db() as conn:
        init_state_db(conn)
        row = conn.execute(
            "SELECT status FROM training_runs WHERE training_run_id = ?",
            (training_run_id,),
        ).fetchone()
    return row is not None and str(row["status"]) == "cancel_requested"


def mark_running(training_run_id: str, step: str, progress: int) -> None:
    now = utc_now_iso()
    with connect_state_db() as conn:
        init_state_db(conn)
        row = conn.execute(
            "SELECT status, started_at FROM training_runs WHERE training_run_id = ?",
            (training_run_id,),
        ).fetchone()
        if row is None:
            return
        started_at = row["started_at"] or now
        conn.execute(
            """
            UPDATE training_runs
            SET status = 'running', current_step = ?, progress = ?, started_at = ?, updated_at = ?
            WHERE training_run_id = ?
            """,
            (step, progress, started_at, now, training_run_id),
        )
        record_event(
            conn,
            "training.running",
            "training_run",
            training_run_id,
            {"trainingRunId": training_run_id, "step": step, "progress": progress},
        )


def mark_completed(training_run_id: str) -> None:
    now = utc_now_iso()
    with connect_state_db() as conn:
        init_state_db(conn)
        conn.execute(
            """
            UPDATE training_runs
            SET status = 'completed', current_step = 'completed', progress = 100,
                finished_at = ?, updated_at = ?
            WHERE training_run_id = ?
            """,
            (now, now, training_run_id),
        )
        record_event(
            conn,
            "training.completed",
            "training_run",
            training_run_id,
            {"trainingRunId": training_run_id, "status": "completed", "progress": 100},
        )


def mark_cancelled(training_run_id: str, reason: str) -> None:
    now = utc_now_iso()
    with connect_state_db() as conn:
        init_state_db(conn)
        conn.execute(
            """
            UPDATE training_runs
            SET status = 'cancelled', current_step = 'cancelled', error_message = ?,
                finished_at = ?, updated_at = ?
            WHERE training_run_id = ?
            """,
            (reason, now, now, training_run_id),
        )
        record_event(
            conn,
            "training.cancelled",
            "training_run",
            training_run_id,
            {"trainingRunId": training_run_id, "status": "cancelled", "reason": reason},
        )


def mark_failed(training_run_id: str, step: str, message: str) -> None:
    now = utc_now_iso()
    with connect_state_db() as conn:
        init_state_db(conn)
        conn.execute(
            """
            UPDATE training_runs
            SET status = 'failed', current_step = ?, error_message = ?,
                finished_at = ?, updated_at = ?
            WHERE training_run_id = ?
            """,
            (step, message, now, now, training_run_id),
        )
        record_event(
            conn,
            "training.failed",
            "training_run",
            training_run_id,
            {"trainingRunId": training_run_id, "step": step, "status": "failed", "error": message},
        )


def write_log(log, message: str) -> None:
    log.write(message + "\n")
    log.flush()


if __name__ == "__main__":
    main()
