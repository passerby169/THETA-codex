import { InMemoryEventStore } from '@hypha/core';
import { GovernedToolRunner, type ToolCallContext, type ToolCallResult } from '@hypha/tools';
import { createThetaHyphaToolRegistry } from './hypha-registry.js';
import type { ThetaModelCatalogInput, ThetaModelCatalogOutput } from './model-catalog-tool.js';
import type { ThetaModelRecommendInput, ThetaModelRecommendOutput } from './model-recommend-tool.js';
import { THETA_PERMISSION_SCOPES, THETA_TOOL_IDS } from './tool-ids.js';

export interface ThetaHyphaRunnerOptions {
  userId?: string;
  workspaceId?: string;
  permissionScopes?: string[];
}

export interface ThetaHyphaRuntime {
  runner: GovernedToolRunner;
  trace: InMemoryEventStore;
}

export const createThetaHyphaRuntime = (): ThetaHyphaRuntime => {
  const registry = createThetaHyphaToolRegistry();
  const trace = new InMemoryEventStore();
  const runner = new GovernedToolRunner(registry, trace);
  return { runner, trace };
};

export const createThetaToolCallContext = (
  runId: string,
  stepId: string,
  options: ThetaHyphaRunnerOptions = {}
): ToolCallContext => ({
  runId,
  stepId,
  userId: options.userId ?? 'local_user',
  workspaceId: options.workspaceId ?? 'local_workspace',
  principal: {
    id: options.userId ?? 'local_user',
    type: 'user',
    userId: options.userId ?? 'local_user',
    workspaceId: options.workspaceId ?? 'local_workspace',
    permissionScopes: options.permissionScopes ?? [THETA_PERMISSION_SCOPES.modelRead],
  },
  metadata: {
    source: 'theta-cli-agent',
  },
});

export const runThetaModelCatalog = async (
  input: ThetaModelCatalogInput = {},
  options: ThetaHyphaRunnerOptions = {}
): Promise<ToolCallResult<ThetaModelCatalogOutput>> => {
  const { runner } = createThetaHyphaRuntime();
  return runner.run({
    toolId: THETA_TOOL_IDS.modelCatalog,
    input,
    context: createThetaToolCallContext('theta-model-catalog-smoke', 'model_catalog', options),
  }) as Promise<ToolCallResult<ThetaModelCatalogOutput>>;
};

export const runThetaModelRecommend = async (
  input: ThetaModelRecommendInput,
  options: ThetaHyphaRunnerOptions = {}
): Promise<ToolCallResult<ThetaModelRecommendOutput>> => {
  const { runner } = createThetaHyphaRuntime();
  return runner.run({
    toolId: THETA_TOOL_IDS.modelRecommend,
    input,
    context: createThetaToolCallContext('theta-model-recommend-smoke', 'model_recommend', {
      ...options,
      permissionScopes: options.permissionScopes ?? [
        THETA_PERMISSION_SCOPES.modelRead,
        THETA_PERMISSION_SCOPES.datasetRead,
      ],
    }),
  }) as Promise<ToolCallResult<ThetaModelRecommendOutput>>;
};
