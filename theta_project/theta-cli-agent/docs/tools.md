# THETA CLI Agent Tool Contracts

This folder defines the local Tool layer for the Hypha-based THETA CLI Agent.
It does not modify the checked-out `Hypha` framework source.

## Boundary

Tools are the only approved way for the agent runtime to touch THETA data,
plans, training processes, results and local RAG indexes.

The LLM layer must not call Python functions directly. It may request a tool
call, but tool execution is governed by Hypha policies, permission scopes,
idempotency keys, audit records and human approval rules.

## First Tool Set

| Tool ID | Effect | Scope | Purpose |
| --- | --- | --- | --- |
| `theta.dataset.inspect` | read | `theta:dataset:read` | Inspect format, encoding, columns and samples. |
| `theta.dataset.detect_columns` | read | `theta:dataset:read` | Detect text, time and metadata candidates. |
| `theta.dataset.clean_preview` | read | `theta:dataset:read` | Preview cleaning without writing output. |
| `theta.model.catalog` | read | `theta:model:read` | Return normalized model catalog. |
| `theta.model.recommend` | read | `theta:model:read`, `theta:dataset:read` | Recommend model candidates from deterministic constraints. |
| `theta.plan.validate` | read | `theta:plan:read`, `theta:model:read` | Validate a TrainingPlan before approval. |
| `theta.plan.create` | write | `theta:plan:write` | Create planId and planHash. |
| `theta.plan.approve` | write | `theta:plan:approve` | Record human approval. |
| `theta.training.dry_run` | read | `theta:training:read` | Check resolved commands and artifacts. |
| `theta.training.start` | external_effect | `theta:training:write` | Start Python Bridge training after approval. |
| `theta.training.status` | read | `theta:training:read` | Read logs, status and artifact references. |
| `theta.training.cancel` | external_effect | `theta:training:write` | Request cooperative cancellation. |
| `theta.results.list` | read | `theta:results:read` | List training result artifacts. |
| `theta.results.summarize` | read | `theta:results:read` | Build deterministic result summaries. |
| `theta.rag.index` | write | `theta:rag:write` | Index local evidence documents. |
| `theta.rag.search` | read | `theta:rag:read` | Search local evidence with citations. |
| `theta.events.export` | read | `theta:events:read` | Export local audit events. |
| `theta.events.replay` | read | `theta:events:read` | Replay exported events without side effects. |

## Bridge Status

The first read-only bridge commands are wired through `theta_agent_bridge`:

- `theta.dataset.inspect`
- `theta.dataset.detect_columns`
- `theta.dataset.clean_preview`
- `theta.model.catalog`
- `theta.model.recommend`
- `theta.plan.validate`
- `theta.plan.create`
- `theta.plan.approve`
- `theta.training.dry_run`
- `theta.training.start`
- `theta.training.status`
- `theta.training.cancel`
- `theta.results.list`
- `theta.results.summarize`
- `theta.rag.index`
- `theta.rag.search`
- `theta.events.export`
- `theta.events.replay`

`theta.plan.create` and `theta.plan.approve` write only to the local Agent
state database at `theta_project/.theta_agent/agent.sqlite`.

`theta.training.start` records an approved local training run and starts a
background Python runner process. The runner executes the resolved
`prepare_data.py` and `run_pipeline.py` commands, writes a UTF-8 log file under
`theta_project/.theta_agent/runs/<trainingRunId>/training.log`, and updates
SQLite status fields.

`theta.training.status` returns the run status, progress, runner PID, current
step, log path, recent log lines, expected artifacts and recorded events. If a
runner exits before reporting a terminal state, status reconciliation marks the
run as `failed` or `cancelled` instead of leaving it stuck forever.

`theta.training.cancel` requests cooperative cancellation. Active runs move to
`cancel_requested`; the runner then terminates the active THETA subprocess and
marks the run `cancelled`. Runs without a spawned process can move directly to
`cancelled`.

`theta.results.list` scans local THETA result artifacts under
`theta_project/result` and `theta_project/worker_runs`. It can locate artifacts
by `trainingRunId`, `datasetId`, `userId`, `modelId` or an explicit local
`resultRoot`, then returns stable artifact IDs, paths, file kinds, sizes and
optional small previews.

`theta.results.summarize` builds deterministic, non-LLM summaries from result
CSV and JSON artifacts, including topic tables, topic word files, metrics,
configs and visualization inventory.

`theta.rag.index` builds a local lexical evidence index in
`theta_project/.theta_agent/agent.sqlite`. It accepts files or directories
inside `theta_project`, recursively indexes text-like files, chunks content and
stores document/chunk metadata. It currently supports `.txt`, `.md`, `.csv`,
`.tsv`, `.json`, `.jsonl`, `.yaml`, `.yml`, `.py`, `.ts`, `.tsx`, `.js`,
`.jsx`, `.html` and `.htm`.

`theta.rag.search` searches the local collection deterministically and returns
ranked citations with relative paths, source paths, chunk IDs and text snippets.
It does not call an LLM or external embedding service.

`theta.events.export` reads the local audit log from
`theta_project/.theta_agent/agent.sqlite` and can filter by event id range,
event type, subject type or subject id. It may include a compact state snapshot
for handoff or inspection.

`theta.events.replay` validates an exported event sequence deterministically,
checks ordering and event hashes, reconstructs subject summaries and can compare
the event export against the current local state database. It performs no tool
execution and has no external side effects.
