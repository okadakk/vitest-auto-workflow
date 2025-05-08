import * as dotenv from 'dotenv'
dotenv.config();

import { Mastra } from '@mastra/core';
import { testFixWorkflow } from './workflows/testFix';

const mastra = new Mastra({
  vnext_workflows: {
    testFixWorkflow,
  },
});

(async () => {
  console.log('mastra initialized');
  const run = mastra.vnext_getWorkflow('testFixWorkflow').createRun();
  await run.start({
    inputData: {
      targetFolder: process.env.TARGET_FOLDER || 'test',
      testScript: process.env.TEST_SCRIPT || 'pnpm test',
    },
  });
  console.log('testFixWorkflow run created');
})();
