import type { JsonSchema } from '@hypha/core';
import type { ToolCallContext, ToolHandler, ToolSpec } from '@hypha/tools';
import { callThetaBridge } from './bridge.js';
import type { ThetaTrainingPlan } from './plan-validate-tool.js';
import { THETA_PERMISSION_SCOPES, THETA_TOOL_IDS } from './tool-ids.js';

export interface ThetaPlanCreateInput {
  plan: ThetaTrainingPlan;
  rationale?: string;
  dataProfile?: Record<string, unknown>;
}

export interface ThetaPlanCreateOutput {
  planId: string;
  planHash: string;
  valid: boolean;
  approvalRequired: boolean;
  createdAt: string;
  normalizedPlan: Record<string, unknown>;
  validation: Record<string, unknown>;
  stateDb: string;
}

const planCreateInputSchema: JsonSchema = {
  type: 'object',
  required: ['plan'],
  properties: {
    plan: {
      type: 'object',
      required: ['datasetId', 'modelId', 'mode', 'numTopics'],
      additionalProperties: true,
    },
    rationale: { type: 'string' },
    dataProfile: {
      type: 'object',
      additionalProperties: true,
    },
  },
  additionalProperties: false,
};

const planCreateOutputSchema: JsonSchema = {
  type: 'object',
  required: [
    'planId',
    'planHash',
    'valid',
    'approvalRequired',
    'createdAt',
    'normalizedPlan',
    'validation',
    'stateDb',
  ],
  properties: {
    planId: { type: 'string' },
    planHash: { type: 'string' },
    valid: { type: 'boolean' },
    approvalRequired: { type: 'boolean' },
    createdAt: { type: 'string' },
    normalizedPlan: {
      type: 'object',
      additionalProperties: true,
    },
    validation: {
      type: 'object',
      additionalProperties: true,
    },
    stateDb: { type: 'string' },
  },
  additionalProperties: false,
};

export const thetaPlanCreateToolSpec: ToolSpec = {
  id: THETA_TOOL_IDS.planCreate,
  version: '1.0.0',
  displayName: 'Create Training Plan',
  description: 'Create a canonical THETA training plan only after Hypha human approval and idempotency checks.',
  tags: ['theta', 'plan'],
  inputSchema: planCreateInputSchema,
  outputSchema: planCreateOutputSchema,
  sideEffectLevel: 'write',
  permissionScope: [THETA_PERMISSION_SCOPES.planWrite],
  humanApprovalPolicy: {
    required: true,
    reason: 'Creating a THETA training plan writes local agent state and must be explicitly approved.',
  },
  idempotencyPolicy: {
    mode: 'required',
  },
  timeoutPolicy: {
    timeoutMs: 30000,
    onTimeout: 'fail',
  },
  retryPolicy: {
    maxAttempts: 1,
  },
  auditPolicy: {
    enabled: true,
    includeInput: false,
    includeOutput: true,
  },
  source: 'local',
};

const normalizePlanCreateInput = (input: unknown): ThetaPlanCreateInput => {
  if (!input || typeof input !== 'object' || !('plan' in input)) {
    throw new Error('plan.create input must include plan.');
  }
  return input as ThetaPlanCreateInput;
};

const ensurePlanCreateOutput = (data: unknown): ThetaPlanCreateOutput => {
  if (!data || typeof data !== 'object') {
    throw new Error('plan.create bridge returned a non-object payload.');
  }
  return data as ThetaPlanCreateOutput;
};

export const thetaPlanCreateHandler: ToolHandler<unknown, ThetaPlanCreateOutput> = async (
  input: unknown,
  context: ToolCallContext
) => {
  const response = await callThetaBridge('plan.create', normalizePlanCreateInput(input), {
    runId: context.runId,
    stepId: context.stepId,
  });

  if (response.status !== 'ok') {
    throw new Error(response.error?.message ?? 'plan.create bridge command failed.');
  }

  return ensurePlanCreateOutput(response.data);
};
