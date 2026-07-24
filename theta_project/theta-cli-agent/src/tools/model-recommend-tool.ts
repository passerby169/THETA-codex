import type { JsonSchema } from '@hypha/core';
import type { ToolCallContext, ToolHandler, ToolSpec } from '@hypha/tools';
import { callThetaBridge } from './bridge.js';
import { THETA_PERMISSION_SCOPES, THETA_TOOL_IDS } from './tool-ids.js';

export interface ThetaModelRecommendInput {
  dataProfile: Record<string, unknown>;
  researchGoal?: string;
  constraints?: Record<string, unknown>;
}

export interface ThetaModelRecommendOutput {
  deterministic: boolean;
  catalogSource: string;
  dataProfileSummary: Record<string, unknown>;
  recommendations: Array<Record<string, unknown>>;
  skipped: Array<Record<string, unknown>>;
  warnings: string[];
  constraintsApplied: Record<string, unknown>;
}

const dataProfileSchema: JsonSchema = {
  type: 'object',
  additionalProperties: true,
  description: 'Normalized dataset profile produced by theta.dataset.inspect or dataset.detect_columns.',
};

const modelRecommendInputSchema: JsonSchema = {
  type: 'object',
  required: ['dataProfile'],
  properties: {
    dataProfile: dataProfileSchema,
    researchGoal: { type: 'string' },
    constraints: {
      type: 'object',
      additionalProperties: true,
    },
  },
  additionalProperties: false,
};

const modelRecommendOutputSchema: JsonSchema = {
  type: 'object',
  required: [
    'deterministic',
    'catalogSource',
    'dataProfileSummary',
    'recommendations',
    'skipped',
    'warnings',
    'constraintsApplied',
  ],
  properties: {
    deterministic: { type: 'boolean' },
    catalogSource: { type: 'string' },
    dataProfileSummary: {
      type: 'object',
      additionalProperties: true,
    },
    recommendations: {
      type: 'array',
      items: {
        type: 'object',
        required: ['rank', 'modelId', 'modelName', 'score', 'reasons', 'warnings', 'requirements'],
        properties: {
          rank: { type: 'integer' },
          modelId: { type: 'string' },
          modelName: { type: 'string' },
          score: { type: 'integer' },
          reasons: { type: 'array', items: { type: 'string' } },
          warnings: { type: 'array', items: { type: 'string' } },
          requirements: { type: 'array', items: { type: 'string' } },
          recommendedPlanPatch: {
            type: 'object',
            additionalProperties: true,
          },
        },
        additionalProperties: true,
      },
    },
    skipped: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: true,
      },
    },
    warnings: { type: 'array', items: { type: 'string' } },
    constraintsApplied: {
      type: 'object',
      additionalProperties: true,
    },
  },
  additionalProperties: false,
};

export const thetaModelRecommendToolSpec: ToolSpec = {
  id: THETA_TOOL_IDS.modelRecommend,
  version: '1.0.0',
  displayName: 'Recommend Model',
  description: 'Recommend THETA model and parameter candidates from a dataset profile through Hypha governance.',
  tags: ['theta', 'model'],
  inputSchema: modelRecommendInputSchema,
  outputSchema: modelRecommendOutputSchema,
  sideEffectLevel: 'read',
  permissionScope: [THETA_PERMISSION_SCOPES.modelRead, THETA_PERMISSION_SCOPES.datasetRead],
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

const normalizeModelRecommendInput = (input: unknown): ThetaModelRecommendInput => {
  if (!input || typeof input !== 'object' || !('dataProfile' in input)) {
    throw new Error('model.recommend input must include dataProfile.');
  }
  return input as ThetaModelRecommendInput;
};

const ensureModelRecommendOutput = (data: unknown): ThetaModelRecommendOutput => {
  if (!data || typeof data !== 'object') {
    throw new Error('model.recommend bridge returned a non-object payload.');
  }
  return data as ThetaModelRecommendOutput;
};

export const thetaModelRecommendHandler: ToolHandler<unknown, ThetaModelRecommendOutput> = async (
  input: unknown,
  context: ToolCallContext
) => {
  const response = await callThetaBridge('model.recommend', normalizeModelRecommendInput(input), {
    runId: context.runId,
    stepId: context.stepId,
  });

  if (response.status !== 'ok') {
    throw new Error(response.error?.message ?? 'model.recommend bridge command failed.');
  }

  return ensureModelRecommendOutput(response.data);
};
