import type { SideEffectLevel, ToolSpec } from "./hypha-compatible.js";
import {
  anyJsonSchema,
  arraySchema,
  booleanSchema,
  enumStringSchema,
  numberSchema,
  objectSchema,
  stringSchema
} from "./json-schema.js";
import { THETA_PERMISSION_SCOPES, THETA_TOOL_IDS, type ThetaToolId } from "./tool-ids.js";

type ToolCategory = "dataset" | "model" | "plan" | "training" | "results" | "rag" | "events";

interface ThetaToolOptions {
  id: ThetaToolId;
  displayName: string;
  description: string;
  category: ToolCategory;
  sideEffectLevel: SideEffectLevel;
  permissionScope: string[];
  inputSchema: ToolSpec["inputSchema"];
  outputSchema?: ToolSpec["outputSchema"];
  approvalRequired?: boolean;
  idempotencyMode?: "none" | "optional" | "required";
  deterministic?: boolean;
  timeoutMs?: number;
}

const statusOutputSchema = objectSchema(
  {
    status: enumStringSchema(["ok", "not_implemented", "needs_bridge", "rejected", "error"]),
    toolId: stringSchema(),
    message: stringSchema(),
    bridgeCommand: stringSchema(),
    input: anyJsonSchema,
    data: anyJsonSchema,
    error: anyJsonSchema
  },
  ["status", "toolId", "message"]
);

const datasetRefSchema = objectSchema(
  {
    datasetId: stringSchema("Local dataset identifier or project dataset name."),
    filePath: stringSchema("Local file path when data has not yet been imported."),
    userId: stringSchema("Local user namespace."),
    sampleSize: numberSchema("Maximum records to inspect.")
  },
  [],
  "Dataset reference accepted by the Python bridge."
);

const trainingPlanSchema = objectSchema(
  {
    datasetId: stringSchema(),
    modelId: stringSchema(),
    modelSize: stringSchema(),
    mode: enumStringSchema(["zero_shot", "finetune", "supervised", "unsupervised"]),
    numTopics: numberSchema(),
    batchSize: numberSchema(),
    epochs: numberSchema(),
    learningRate: numberSchema(),
    textColumn: stringSchema(),
    metadataColumns: arraySchema(stringSchema())
  },
  ["datasetId", "modelId", "mode", "numTopics"],
  "Canonical training plan before approval."
);

const tool = (options: ThetaToolOptions): ToolSpec => ({
  id: options.id,
  version: "0.1.0",
  displayName: options.displayName,
  description: options.description,
  tags: ["theta", options.category],
  inputSchema: options.inputSchema,
  outputSchema: options.outputSchema ?? statusOutputSchema,
  sideEffectLevel: options.sideEffectLevel,
  permissionScope: options.permissionScope,
  timeoutPolicy: {
    timeoutMs: options.timeoutMs ?? 30000,
    onTimeout: "fail"
  },
  retryPolicy: {
    maxAttempts: 1
  },
  auditPolicy: {
    enabled: true,
    includeInput: options.sideEffectLevel !== "read",
    includeOutput: true
  },
  idempotencyPolicy: {
    mode: options.idempotencyMode ?? (options.sideEffectLevel === "read" ? "optional" : "required")
  },
  source: "local",
  semantics: {
    sideEffectLevel: options.sideEffectLevel,
    idempotency: options.sideEffectLevel === "read" ? "intrinsic" : "caller_key",
    deterministic: options.deterministic ?? true,
    readOnlyHint: options.sideEffectLevel === "read",
    resultSemantics: options.sideEffectLevel === "read" ? "observation" : "state_patch"
  },
  metadata: {
    theta: {
      category: options.category,
      approvalRequired: options.approvalRequired ?? false,
      bridgeBoundary: "theta_agent_bridge",
      contractPhase: "milestone-1"
    }
  }
});

export const thetaToolSpecs: ToolSpec[] = [
  tool({
    id: THETA_TOOL_IDS.datasetInspect,
    displayName: "Inspect Dataset",
    description: "Inspect file format, encoding, rows, columns, missing values and sample records.",
    category: "dataset",
    sideEffectLevel: "read",
    permissionScope: [THETA_PERMISSION_SCOPES.datasetRead],
    inputSchema: datasetRefSchema
  }),
  tool({
    id: THETA_TOOL_IDS.datasetDetectColumns,
    displayName: "Detect Dataset Columns",
    description: "Detect text, time and metadata column candidates using deterministic heuristics.",
    category: "dataset",
    sideEffectLevel: "read",
    permissionScope: [THETA_PERMISSION_SCOPES.datasetRead],
    inputSchema: datasetRefSchema
  }),
  tool({
    id: THETA_TOOL_IDS.datasetCleanPreview,
    displayName: "Preview Data Cleaning",
    description: "Preview cleaning results without writing a cleaned dataset.",
    category: "dataset",
    sideEffectLevel: "read",
    permissionScope: [THETA_PERMISSION_SCOPES.datasetRead],
    inputSchema: objectSchema({
      dataset: datasetRefSchema,
      textColumn: stringSchema(),
      options: objectSchema({
        removeUrls: booleanSchema(),
        removeHtml: booleanSchema(),
        removeStopwords: booleanSchema(),
        normalizeWhitespace: booleanSchema(),
        minWords: numberSchema()
      })
    }, ["dataset", "textColumn"])
  }),
  tool({
    id: THETA_TOOL_IDS.modelCatalog,
    displayName: "List Model Catalog",
    description: "Return normalized THETA model catalog and supported parameter ranges.",
    category: "model",
    sideEffectLevel: "read",
    permissionScope: [THETA_PERMISSION_SCOPES.modelRead],
    inputSchema: objectSchema({
      includeExperimental: booleanSchema()
    })
  }),
  tool({
    id: THETA_TOOL_IDS.modelRecommend,
    displayName: "Recommend Model",
    description: "Recommend model and parameter candidates from data profile and hard constraints.",
    category: "model",
    sideEffectLevel: "read",
    permissionScope: [THETA_PERMISSION_SCOPES.modelRead, THETA_PERMISSION_SCOPES.datasetRead],
    inputSchema: objectSchema({
      dataProfile: anyJsonSchema,
      researchGoal: stringSchema(),
      constraints: anyJsonSchema
    }, ["dataProfile"])
  }),
  tool({
    id: THETA_TOOL_IDS.planValidate,
    displayName: "Validate Training Plan",
    description: "Validate a TrainingPlan against model catalog, data profile and policy constraints.",
    category: "plan",
    sideEffectLevel: "read",
    permissionScope: [THETA_PERMISSION_SCOPES.planRead, THETA_PERMISSION_SCOPES.modelRead],
    inputSchema: objectSchema({
      plan: trainingPlanSchema,
      dataProfile: anyJsonSchema
    }, ["plan"])
  }),
  tool({
    id: THETA_TOOL_IDS.planCreate,
    displayName: "Create Training Plan",
    description: "Create a canonical TrainingPlan and stable planHash for later human approval.",
    category: "plan",
    sideEffectLevel: "write",
    permissionScope: [THETA_PERMISSION_SCOPES.planWrite],
    inputSchema: objectSchema({
      plan: trainingPlanSchema,
      rationale: stringSchema()
    }, ["plan"]),
    approvalRequired: true
  }),
  tool({
    id: THETA_TOOL_IDS.planApprove,
    displayName: "Approve Training Plan",
    description: "Record explicit human approval for a TrainingPlan hash before execution.",
    category: "plan",
    sideEffectLevel: "write",
    permissionScope: [THETA_PERMISSION_SCOPES.planApprove],
    inputSchema: objectSchema({
      planId: stringSchema(),
      planHash: stringSchema(),
      approvedBy: stringSchema(),
      approvalNote: stringSchema()
    }, ["planId", "planHash", "approvedBy"]),
    approvalRequired: true
  }),
  tool({
    id: THETA_TOOL_IDS.trainingDryRun,
    displayName: "Dry Run Training",
    description: "Resolve bridge commands and expected artifacts without starting real training.",
    category: "training",
    sideEffectLevel: "read",
    permissionScope: [THETA_PERMISSION_SCOPES.trainingRead],
    inputSchema: objectSchema({
      planId: stringSchema(),
      planHash: stringSchema()
    }, ["planId", "planHash"])
  }),
  tool({
    id: THETA_TOOL_IDS.trainingStart,
    displayName: "Start Training",
    description: "Start local THETA training through the Python bridge after approval verification.",
    category: "training",
    sideEffectLevel: "external_effect",
    permissionScope: [THETA_PERMISSION_SCOPES.trainingWrite],
    inputSchema: objectSchema({
      planId: stringSchema(),
      planHash: stringSchema(),
      approvalId: stringSchema(),
      idempotencyKey: stringSchema()
    }, ["planId", "planHash", "approvalId", "idempotencyKey"]),
    approvalRequired: true,
    timeoutMs: 60000
  }),
  tool({
    id: THETA_TOOL_IDS.trainingStatus,
    displayName: "Get Training Status",
    description: "Read local training status, logs, progress and artifact references.",
    category: "training",
    sideEffectLevel: "read",
    permissionScope: [THETA_PERMISSION_SCOPES.trainingRead],
    inputSchema: objectSchema({
      trainingRunId: stringSchema()
    }, ["trainingRunId"])
  }),
  tool({
    id: THETA_TOOL_IDS.trainingCancel,
    displayName: "Cancel Training",
    description: "Request cooperative cancellation of a running local training process.",
    category: "training",
    sideEffectLevel: "external_effect",
    permissionScope: [THETA_PERMISSION_SCOPES.trainingWrite],
    inputSchema: objectSchema({
      trainingRunId: stringSchema(),
      reason: stringSchema()
    }, ["trainingRunId", "reason"]),
    approvalRequired: true
  }),
  tool({
    id: THETA_TOOL_IDS.resultsList,
    displayName: "List Results",
    description: "List local THETA result artifacts by training run, dataset, user, model or result root.",
    category: "results",
    sideEffectLevel: "read",
    permissionScope: [THETA_PERMISSION_SCOPES.resultsRead],
    inputSchema: objectSchema({
      trainingRunId: stringSchema(),
      datasetId: stringSchema(),
      userId: stringSchema(),
      modelId: stringSchema(),
      resultRoot: stringSchema(),
      includePreview: booleanSchema(),
      maxFiles: numberSchema()
    })
  }),
  tool({
    id: THETA_TOOL_IDS.resultsSummarize,
    displayName: "Summarize Results",
    description: "Build deterministic summaries from result CSV/JSON artifacts without LLM decisions.",
    category: "results",
    sideEffectLevel: "read",
    permissionScope: [THETA_PERMISSION_SCOPES.resultsRead],
    inputSchema: objectSchema({
      trainingRunId: stringSchema(),
      datasetId: stringSchema(),
      userId: stringSchema(),
      modelId: stringSchema(),
      resultRoot: stringSchema(),
      artifactIds: arraySchema(stringSchema()),
      maxFiles: numberSchema()
    })
  }),
  tool({
    id: THETA_TOOL_IDS.ragIndex,
    displayName: "Index Local RAG",
    description: "Index local evidence documents for later cited retrieval.",
    category: "rag",
    sideEffectLevel: "write",
    permissionScope: [THETA_PERMISSION_SCOPES.ragWrite],
    inputSchema: objectSchema({
      sourcePaths: arraySchema(stringSchema()),
      collectionName: stringSchema(),
      replace: booleanSchema(),
      maxFiles: numberSchema()
    }, ["sourcePaths", "collectionName"]),
    approvalRequired: true
  }),
  tool({
    id: THETA_TOOL_IDS.ragSearch,
    displayName: "Search Local RAG",
    description: "Search local indexed evidence and return citations.",
    category: "rag",
    sideEffectLevel: "read",
    permissionScope: [THETA_PERMISSION_SCOPES.ragRead],
    inputSchema: objectSchema({
      query: stringSchema(),
      collectionName: stringSchema(),
      limit: numberSchema()
    }, ["query", "collectionName"])
  }),
  tool({
    id: THETA_TOOL_IDS.eventsExport,
    displayName: "Export Agent Events",
    description: "Export local agent audit events for inspection, handoff or replay.",
    category: "events",
    sideEffectLevel: "read",
    permissionScope: [THETA_PERMISSION_SCOPES.eventsRead],
    inputSchema: objectSchema({
      sinceEventId: numberSchema(),
      untilEventId: numberSchema(),
      eventTypes: arraySchema(stringSchema()),
      subjectType: stringSchema(),
      subjectId: stringSchema(),
      includeSnapshots: booleanSchema(),
      limit: numberSchema()
    })
  }),
  tool({
    id: THETA_TOOL_IDS.eventsReplay,
    displayName: "Replay Agent Events",
    description: "Replay exported audit events deterministically without side effects.",
    category: "events",
    sideEffectLevel: "read",
    permissionScope: [THETA_PERMISSION_SCOPES.eventsRead],
    inputSchema: objectSchema({
      events: arraySchema(anyJsonSchema),
      verifyState: booleanSchema()
    }, ["events"])
  })
];

export const thetaToolSpecById = new Map(thetaToolSpecs.map((spec) => [spec.id, spec]));
