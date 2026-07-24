import { callThetaBridge } from "./bridge.js";
import type { ToolCallContext } from "./hypha-compatible.js";
import { THETA_TOOL_IDS, type ThetaToolId } from "./tool-ids.js";

export interface ThetaToolPlaceholderResult {
  status: "not_implemented" | "needs_bridge" | "ok" | "error";
  toolId: ThetaToolId;
  message: string;
  bridgeCommand?: string;
  input?: unknown;
  data?: unknown;
  error?: unknown;
}

export type ThetaToolExecutor = (
  input: unknown,
  context: ToolCallContext
) => Promise<ThetaToolPlaceholderResult>;

const bridgePlaceholder =
  (toolId: ThetaToolId, bridgeCommand: string): ThetaToolExecutor =>
  async (input, context) => ({
    status: "needs_bridge",
    toolId,
    message:
      "Tool contract is registered. Execution is deferred to theta_agent_bridge in the next milestone.",
    bridgeCommand,
    input,
    data: {
      runId: context.runId,
      stepId: context.stepId,
      bridgeProtocol: "theta-agent-bridge/v1"
    }
  });

const bridgeExecutor =
  (toolId: ThetaToolId, bridgeCommand: string): ThetaToolExecutor =>
  async (input, context) => {
    const response = await callThetaBridge(bridgeCommand, input, context);
    if (response.status === "ok") {
      return {
        status: "ok",
        toolId,
        message: "Bridge command completed.",
        bridgeCommand,
        input,
        data: response.data
      };
    }

    return {
      status: "error",
      toolId,
      message: response.error?.message ?? "Bridge command failed.",
      bridgeCommand,
      input,
      data: response.data,
      error: response.error
    };
  };

export const thetaToolExecutors: Record<ThetaToolId, ThetaToolExecutor> = {
  [THETA_TOOL_IDS.datasetInspect]: bridgeExecutor(
    THETA_TOOL_IDS.datasetInspect,
    "dataset.inspect"
  ),
  [THETA_TOOL_IDS.datasetDetectColumns]: bridgeExecutor(
    THETA_TOOL_IDS.datasetDetectColumns,
    "dataset.detect_columns"
  ),
  [THETA_TOOL_IDS.datasetCleanPreview]: bridgeExecutor(
    THETA_TOOL_IDS.datasetCleanPreview,
    "dataset.clean_preview"
  ),
  [THETA_TOOL_IDS.modelCatalog]: bridgeExecutor(THETA_TOOL_IDS.modelCatalog, "model.catalog"),
  [THETA_TOOL_IDS.modelRecommend]: bridgeExecutor(
    THETA_TOOL_IDS.modelRecommend,
    "model.recommend"
  ),
  [THETA_TOOL_IDS.planValidate]: bridgeExecutor(THETA_TOOL_IDS.planValidate, "plan.validate"),
  [THETA_TOOL_IDS.planCreate]: bridgeExecutor(THETA_TOOL_IDS.planCreate, "plan.create"),
  [THETA_TOOL_IDS.planApprove]: bridgeExecutor(THETA_TOOL_IDS.planApprove, "plan.approve"),
  [THETA_TOOL_IDS.trainingDryRun]: bridgeExecutor(
    THETA_TOOL_IDS.trainingDryRun,
    "training.dry_run"
  ),
  [THETA_TOOL_IDS.trainingStart]: bridgeExecutor(THETA_TOOL_IDS.trainingStart, "training.start"),
  [THETA_TOOL_IDS.trainingStatus]: bridgeExecutor(
    THETA_TOOL_IDS.trainingStatus,
    "training.status"
  ),
  [THETA_TOOL_IDS.trainingCancel]: bridgeExecutor(
    THETA_TOOL_IDS.trainingCancel,
    "training.cancel"
  ),
  [THETA_TOOL_IDS.resultsList]: bridgeExecutor(THETA_TOOL_IDS.resultsList, "results.list"),
  [THETA_TOOL_IDS.resultsSummarize]: bridgeExecutor(
    THETA_TOOL_IDS.resultsSummarize,
    "results.summarize"
  ),
  [THETA_TOOL_IDS.ragIndex]: bridgeExecutor(THETA_TOOL_IDS.ragIndex, "rag.index"),
  [THETA_TOOL_IDS.ragSearch]: bridgeExecutor(THETA_TOOL_IDS.ragSearch, "rag.search"),
  [THETA_TOOL_IDS.eventsExport]: bridgeExecutor(
    THETA_TOOL_IDS.eventsExport,
    "events.export"
  ),
  [THETA_TOOL_IDS.eventsReplay]: bridgeExecutor(
    THETA_TOOL_IDS.eventsReplay,
    "events.replay"
  )
};
