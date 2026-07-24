import { runThetaPlanValidate } from './tools/hypha-runner.js';

const result = await runThetaPlanValidate({
  plan: {
    datasetId: 'demo-dataset',
    modelId: 'lda',
    mode: 'unsupervised',
    numTopics: 8,
    batchSize: 64,
    epochs: 20,
    textColumn: 'content',
  },
});

if (result.status !== 'completed' || !result.output) {
  throw new Error(`theta.plan.validate did not complete: ${JSON.stringify(result.error ?? result.status)}`);
}

console.log(
  JSON.stringify({
    status: 'ok',
    runner: 'GovernedToolRunner',
    toolId: result.toolId,
    valid: result.output.valid,
    warningCount: result.output.warnings.length,
  })
);
