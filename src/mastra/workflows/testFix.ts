// このworkflowは、失敗したテストを修正するためのものです。
// まず、指定されたフォルダ内のテストスクリプトを実行し、失敗したテストを特定します。
// 次に、失敗したテストを修正するために、関連するファイルを検索し、
// それらのファイルの内容を取得します。
// 最後に、修正されたコードをテストスクリプトで実行し、
// 修正が成功したかどうかを確認します。
// 失敗したテストが修正されるまで、または最大2回まで繰り返します。

import { createStep, createWorkflow } from "@mastra/core/workflows/vNext";
import { z } from "zod";
import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { relatedFileSearchAgent } from "../agents/relatedFileSearch";
import { testFixAgent } from "../agents/testFix";

const relatedFileSearchStep = createStep({
  id: 'related-file-search',
  inputSchema: z.object({
    targetFolder: z.string(),
    testScript: z.string(),
    testFileName: z.string()
  }),
  outputSchema: z.object({
    sourceFileContent: z.object({
      filePath: z.string(),
      content: z.string(),
    }),
    relatedFileContents: z.array(z.object({
      filePath: z.string(),
      content: z.string(),
    })),
    targetFolder: z.string(),
    testScript: z.string(),
    testFileName: z.string(),
    count: z.number(),
  }),
  execute: async ({ inputData }) => {
    const { targetFolder, testScript, testFileName } = inputData;
    console.log('Running related file search with input data:', testFileName);
    const targetFilePath = path.join(targetFolder, testFileName);
    const sourceFilePath = targetFilePath.replace('.test.ts', '.ts').replace('/test/', '/src/');
    console.log('Source file path:', sourceFilePath);
    const sourceFileContent = execSync(`cat ${sourceFilePath}`, { encoding: 'utf-8' });

    const res = await relatedFileSearchAgent.generate([
      {
        role: 'user',
        content: `I need to find related files to help fix a failing test.

## Source File Path
${sourceFilePath}

## Source File Content
\`\`\`typescript
${sourceFileContent}
\`\`\`

Please analyze this file and identify all related files that might be needed to understand and fix tests for this code. Return only the file paths as a JSON array.`
      },
    ], {
      output: z.array(z.string())
    });
    const relatedFiles = res.object;
    console.log('Identified related files:', relatedFiles);
    const relatedFileContents = relatedFiles.map(fileName => {
      const filePath = fileName.indexOf(targetFolder) >= 0 ? fileName : path.join(targetFolder, fileName);
      try {
        const content = execSync(`cat ${filePath}`, { encoding: 'utf-8' });
        return { filePath, content };
      } catch (error) {
        console.error(`Error reading file ${filePath}`);
        return { filePath, content: '' };
      }
    });
    return {
      sourceFileContent: {
        filePath: sourceFilePath,
        content: sourceFileContent
      },
      relatedFileContents: relatedFileContents.filter(file => file.content !== ''),
      targetFolder,
      testFileName,
      testScript,
      count: 0
    };
  }
});

const fixSingleTestStep = createStep({
  id: 'fix-single-test',
  inputSchema: z.object({
    sourceFileContent: z.object({
      filePath: z.string(),
      content: z.string(),
    }),
    relatedFileContents: z.array(z.object({
      filePath: z.string(),
      content: z.string(),
    })),
    targetFolder: z.string(),
    testScript: z.string(),
    testFileName: z.string(),
    count: z.number(),
  }),
  outputSchema: z.object({
    sourceFileContent: z.object({
      filePath: z.string(),
      content: z.string(),
    }),
    relatedFileContents: z.array(z.object({
      filePath: z.string(),
      content: z.string(),
    })),
    targetFolder: z.string(),
    testScript: z.string(),
    testFileName: z.string(),
    count: z.number(),
    isSuccess: z.boolean(),
  }),
  execute: async ({ inputData }) => {
    const { targetFolder, testScript, testFileName, relatedFileContents, sourceFileContent, count } = inputData;
    console.log('Running test fix with testFilename:', testFileName, 'count:', count);
    const targetFilePath = path.join(targetFolder, testFileName);

    // testScriptを実行して、テストが失敗するか確認
    let errorText = '';
    try {
      execSync(`${testScript} ${testFileName}`, { cwd: targetFolder, encoding: 'utf-8', stdio: 'pipe' });
      console.log('Test script executed successfully, no failing tests found.');
      return { isSuccess: true, count: count + 1, sourceFileContent, relatedFileContents, targetFolder, testScript, testFileName };
    } catch (error: unknown) {
      const errorMessage = (error as string).toString();
      // ⎯⎯⎯⎯⎯⎯⎯ Failed Tests より下の部分を取得
      const testErrorIndex = errorMessage.indexOf('⎯⎯⎯ Failed Tests');
      errorText = errorMessage.substring(testErrorIndex);
    }

    // targetFilePathからファイルの内容を取得
    const fileContent = execSync(`cat ${targetFilePath}`, { encoding: 'utf-8' });

    const testFixRes = await testFixAgent.generate([
      {
        role: 'user',
        content: `I need help fixing a failing test. Here's all the information:

## Test File
File Path: ${targetFilePath}

\`\`\`typescript
${fileContent}
\`\`\`

## Error Output
\`\`\`
${errorText}
\`\`\`

## Test Target File
### File: ${sourceFileContent.filePath}

\`\`\`typescript
${sourceFileContent.content}
\`\`\`


## Related Files
${relatedFileContents.map(file => `
### File: ${file.filePath}

\`\`\`typescript
${file.content}
\`\`\`
`).join('\n')}

Please fix the failing test and return ONLY the JSON with the fixed test code.`,
      }
    ], {
      output: z.object({
        content: z.string(),
      }),
    });
    const fixedCode = testFixRes.object.content;

    fs.writeFileSync(targetFilePath, fixedCode);

    try {
      execSync(`${testScript} ${testFileName}`, { cwd: targetFolder, encoding: 'utf-8', stdio: 'pipe' });
      return { isSuccess: true, count: count + 1, sourceFileContent, relatedFileContents, targetFolder, testScript, testFileName };
    } catch (error: unknown) {
      return { isSuccess: false, count: count + 1, sourceFileContent, relatedFileContents, targetFolder, testScript, testFileName };
    }
  }
});

const singleTestFixWorkflow = createWorkflow({
  id: 'single-test-fix-workflow',
  inputSchema: z.object({
    targetFolder: z.string(),
    testScript: z.string(),
    testFileName: z.string()
  }),
  outputSchema: z.object({
    isSuccess: z.boolean(),
  }),
  steps: [
    relatedFileSearchStep,
    fixSingleTestStep,
  ],
})
.then(relatedFileSearchStep)
.dountil(fixSingleTestStep, async ({ inputData }) => inputData.isSuccess || inputData.count >= 1)
.commit();

const runInitialTestsStep = createStep({
  id: 'run-initial-tests',
  inputSchema: z.object({
    targetFolder: z.string(),
    testScript: z.string(),
  }),
  outputSchema: z.object({
    targetFolder: z.string(),
    testScript: z.string(),
    failingTests: z.array(z.string()),
  }),
  execute: async ({ inputData }) => {
    console.log('Running initial tests with input data:', inputData);
    const { targetFolder, testScript } = inputData;
    let failingTests: string[] = [];

    // Execute the test script in the target folder
    // Ensure targetFolder is an absolute path or resolve it
    const absoluteTargetFolder = path.resolve(targetFolder);
    try {
      execSync(testScript, { cwd: absoluteTargetFolder, encoding: 'utf-8', stdio: 'pipe' });
      return { targetFolder, testScript, failingTests: [] };
    } catch (error: unknown) {
      const matches = (error as string).toString().match(/FAIL .*\/(.*\.test\.[tj]sx?)/g) || [];
      failingTests = matches.map(match => match.replace(/FAIL  /, ''));
      // 重複を排除
      failingTests = [...new Set(failingTests)];
      return { targetFolder, testScript, failingTests };
    }
  }
});

const fixTestStep = createStep({
  id: 'fix-test',
  inputSchema: z.object({
    targetFolder: z.string(),
    testScript: z.string(),
    failingTests: z.array(z.string()),
  }),
  outputSchema: z.object({
    result: z.string(),
  }),
  execute: async ({ inputData }) => {
    const { targetFolder, testScript, failingTests } = inputData;
    console.log('Identifying test to fix from failing tests:', failingTests);
    await Promise.all(failingTests.map(async testFileName => {
      console.log(`Processing test: ${testFileName}`);
      const run = singleTestFixWorkflow.createRun();
      await run.start({
        inputData: {
          targetFolder: targetFolder,
          testScript: testScript,
          testFileName: testFileName,
        },
      });
    }));

    return { result: 'Processed failing tests' };
  }
});

export const testFixWorkflow = createWorkflow({
  id: 'test-fix',
  inputSchema: z.object({
    targetFolder: z.string(),
    testScript: z.string(),
  }),
  outputSchema: z.object({
    result: z.string(),
  }),
  steps: [runInitialTestsStep, fixTestStep],
}).then(runInitialTestsStep)
  .then(fixTestStep)
  .commit();
