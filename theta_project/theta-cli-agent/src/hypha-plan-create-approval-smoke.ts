import { requestThetaPlanCreate } from './tools/hypha-runner.js';

const result = await requestThetaPlanCreate({
  plan: {
    datasetId: 'demo-dataset',
    modelId: 'lda',
    mode: 'unsupervised',
    numTopics: 8,
    textColumn: 'content',
  },
  rationale: 'Smoke test only verifies Hypha approval gating before local state writes.',
});

if (result.status !== 'human_review_required') {
  throw new Error(`theta.plan.create should require human review before execution: ${JSON.stringify(result)}`);
}

console.log(
  JSON.stringify({
    status: 'ok',
    runner: 'GovernedToolRunner',
    toolId: result.toolId,
    gate: 'human_review_required',
    errorCode: typeof result.error === 'object' ? result.error.code : undefined,
  })
);
