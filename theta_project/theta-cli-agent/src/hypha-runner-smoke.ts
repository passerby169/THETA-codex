import { runThetaModelCatalog } from './tools/hypha-runner.js';

const result = await runThetaModelCatalog();

if (result.status !== 'completed' || !result.output) {
  throw new Error(`theta.model.catalog did not complete: ${JSON.stringify(result.error ?? result.status)}`);
}

console.log(
  JSON.stringify({
    status: 'ok',
    runner: 'GovernedToolRunner',
    toolId: result.toolId,
    modelCount: result.output.models.length,
    supportedModelIds: result.output.supportedModelIds,
  })
);
