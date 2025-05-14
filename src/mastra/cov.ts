import * as dotenv from 'dotenv'
dotenv.config();

import { Mastra } from '@mastra/core';
import { coverageFixWorkflow } from './workflows/coverageFix';

const mastra = new Mastra({
  vnext_workflows: {
    coverageFixWorkflow,
  },
});

(async () => {
  console.log('mastra initialized');
  const run = mastra.vnext_getWorkflow('coverageFixWorkflow').createRun();
  await run.start({
    inputData: {
      targetFolder: process.env.TARGET_FOLDER || 'coverage',
      coverageScript: process.env.coverage_SCRIPT || 'pnpm coverage',
    },
  });
  console.log('coverageFixWorkflow run created');
})();
