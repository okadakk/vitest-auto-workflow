// このworkflowは、テストカバレッジを改善するためのものです。
// まず、指定されたフォルダ内のテストカバレッジを解析し、カバレッジが不足している箇所を特定します。
// 次に、カバレッジが不足しているファイルに対して、関連するファイルを検索し、
// それらのファイルの内容を取得します。
// 最後に、カバレッジを向上させるための追加テストコードを生成し、
// テストスクリプトで実行してカバレッジが向上したかを確認します。

import { createStep, createWorkflow } from "@mastra/core/workflows/vNext";
import { z } from "zod";
import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { relatedFileSearchAgent } from "../agents/relatedFileSearch";
// We'll need to create these agents
import { coverageAnalysisAgent } from "../agents/coverageAnalysis";
import { coverageFixAgent } from "../agents/coverageFix";

// 型定義
interface CoverageData {
  file: string;
  stmts: number;
  branch: number;
  funcs: number;
  lines: number;
  uncoveredLines: string;
}

// カバレッジレポートを解析するステップ
const analyzeCodeCoverageStep = createStep({
  id: 'analyze-code-coverage',
  inputSchema: z.object({
    targetFolder: z.string(),
    testScript: z.string(),
    coverageThreshold: z.number().optional(), // カバレッジのしきい値（デフォルトは100%）
  }),
  outputSchema: z.object({
    targetFolder: z.string(),
    testScript: z.string(),
    coverageThreshold: z.number(),
    lowCoverageFiles: z.array(z.object({
      filePath: z.string(),
      stmts: z.number(),
      branch: z.number(),
      funcs: z.number(),
      lines: z.number(),
      uncoveredLines: z.string(),
    })),
  }),
  execute: async ({ inputData }) => {
    const { targetFolder, testScript, coverageThreshold = 100 } = inputData;
    console.log('Running coverage analysis with input data:', inputData);

    // テストスクリプトを実行してカバレッジレポートを生成
    let coverageOutput = '';
    try {
      const absoluteTargetFolder = path.resolve(targetFolder);
      coverageOutput = execSync(`${testScript} --coverage`, {
        cwd: absoluteTargetFolder,
        encoding: 'utf-8',
        stdio: 'pipe'
      });
    } catch (error: unknown) {
      const errorOutput = (error as { stdout?: string })?.stdout || '';
      coverageOutput = errorOutput;
    }

    // 解析するためにAIエージェントを使用してカバレッジデータを抽出
    const coverageAnalysisResult = await coverageAnalysisAgent.generate([
      {
        role: 'user',
        content: `Please analyze this test coverage report and identify files that don't meet the coverage threshold of ${coverageThreshold}%.

\`\`\`
${coverageOutput}
\`\`\`

Extract the data for files with less than ${coverageThreshold}% coverage in any category (statements, branches, functions, or lines).
Return the data as a JSON array with objects containing: filePath, stmts, branch, funcs, lines, and uncoveredLines.`
      }
    ], {
      output: z.array(z.object({
        filePath: z.string(),
        stmts: z.number(),
        branch: z.number(),
        funcs: z.number(),
        lines: z.number(),
        uncoveredLines: z.string(),
      }))
    });

    const lowCoverageFiles = coverageAnalysisResult.object;
    console.log('Identified low coverage files:', lowCoverageFiles);

    return {
      targetFolder,
      testScript,
      coverageThreshold,
      lowCoverageFiles
    };
  }
});

// 個別のファイルのカバレッジを改善するステップ
const improveFileCoverageStep = createStep({
  id: 'improve-file-coverage',
  inputSchema: z.object({
    targetFolder: z.string(),
    filePath: z.string(),
    stmts: z.number(),
    branch: z.number(),
    funcs: z.number(),
    lines: z.number(),
    uncoveredLines: z.string(),
  }),
  outputSchema: z.object({
    targetFolder: z.string(),
    filePath: z.string(),
    testFilePath: z.string(),
    isImproved: z.boolean(),
  }),
  execute: async ({ inputData }) => {
    const { targetFolder, filePath, uncoveredLines } = inputData;
    console.log(`Improving coverage for file: ${filePath}, uncovered lines: ${uncoveredLines}`);

    // ソースファイルのパスを解析
    const absoluteFilePath = path.join(targetFolder, filePath);
    const sourceFileContent = fs.readFileSync(absoluteFilePath, 'utf-8');

    // 関連するテストファイルのパスを特定
    const fileDir = path.dirname(filePath);
    const fileName = path.basename(filePath);
    const testFileDir = fileDir.replace(/\/src\//, '/test/');
    const testFileName = fileName.replace(/\.ts$/, '.test.ts');
    const testFilePath = path.join(testFileDir, testFileName);
    const absoluteTestFilePath = path.join(targetFolder, testFilePath);

    let existingTestContent = '';
    try {
      existingTestContent = fs.readFileSync(absoluteTestFilePath, 'utf-8');
    } catch (error) {
      console.log(`Test file ${absoluteTestFilePath} does not exist yet. Will create a new one.`);
      // テストファイルが存在しない場合は、ディレクトリを作成
      fs.mkdirSync(path.dirname(absoluteTestFilePath), { recursive: true });
    }

    // 関連するファイルを検索
    const res = await relatedFileSearchAgent.generate([
      {
        role: 'user',
        content: `I need to find related files to help improve test coverage.

## Source File Path
${absoluteFilePath}

## Source File Content
\`\`\`typescript
${sourceFileContent}
\`\`\`

Please analyze this file and identify all related files that might be needed to understand and create comprehensive tests for this code. Return only the file paths as a JSON array.`
      },
    ], {
      output: z.array(z.string())
    });

    const relatedFiles = res.object;
    console.log('Identified related files:', relatedFiles);

    const relatedFileContents = relatedFiles.map(fileName => {
      const relatedFilePath = fileName.indexOf(targetFolder) >= 0 ? fileName : path.join(targetFolder, fileName);
      try {
        const content = fs.readFileSync(relatedFilePath, 'utf-8');
        return { filePath: relatedFilePath, content };
      } catch (error) {
        console.error(`Error reading file ${relatedFilePath}`);
        return { filePath: relatedFilePath, content: '' };
      }
    }).filter(file => file.content !== '');

    // 改善されたテストコードを生成
    const coverageFixResult = await coverageFixAgent.generate([
      {
        role: 'user',
        content: `I need to improve test coverage for a file. Here's all the information:

## Source File
File Path: ${absoluteFilePath}

\`\`\`typescript
${sourceFileContent}
\`\`\`

## Current Test File (if exists)
File Path: ${absoluteTestFilePath}

\`\`\`typescript
${existingTestContent}
\`\`\`

## Coverage Information
- Statements: ${inputData.stmts}%
- Branches: ${inputData.branch}%
- Functions: ${inputData.funcs}%
- Lines: ${inputData.lines}%
- Uncovered Lines: ${uncoveredLines}

## Related Files
${relatedFileContents.map(file => `
### File: ${file.filePath}

\`\`\`typescript
${file.content}
\`\`\`
`).join('\n')}

Please generate an improved test file that will increase the test coverage. Focus especially on the uncovered lines.
Return ONLY the complete test code that should be written to the test file.`
      }
    ], {
      output: z.object({
        testCode: z.string(),
      }),
    });

    const improvedTestCode = coverageFixResult.object.testCode;

    // 新しいテストコードをファイルに書き込む
    fs.writeFileSync(absoluteTestFilePath, improvedTestCode);

    // テストを実行して改善されたかどうかを確認
    try {
      execSync(`${inputData.testScript} ${testFilePath} --coverage`, {
        cwd: targetFolder,
        encoding: 'utf-8'
      });
      return {
        targetFolder,
        filePath,
        testFilePath,
        isImproved: true
      };
    } catch (error: unknown) {
      const errorOutput = (error as { stdout?: string })?.stdout || '';
      console.log('Test execution output:', errorOutput);

      // エラーが出てもカバレッジが改善されていれば成功とみなす
      if (errorOutput.includes('All files') && !errorOutput.includes(uncoveredLines)) {
        return {
          targetFolder,
          filePath,
          testFilePath,
          isImproved: true
        };
      }

      return {
        targetFolder,
        filePath,
        testFilePath,
        isImproved: false
      };
    }
  }
});

// カバレッジを改善するワークフロー
const improveCoverageWorkflow = createWorkflow({
  id: 'improve-coverage-workflow',
  inputSchema: z.object({
    targetFolder: z.string(),
    testScript: z.string(),
    filePath: z.string(),
    stmts: z.number(),
    branch: z.number(),
    funcs: z.number(),
    lines: z.number(),
    uncoveredLines: z.string(),
  }),
  outputSchema: z.object({
    filePath: z.string(),
    testFilePath: z.string(),
    isImproved: z.boolean(),
  }),
  steps: [improveFileCoverageStep],
})
.then(improveFileCoverageStep)
.commit();

// カバレッジフィックスのメインステップ
const fixCoverageStep = createStep({
  id: 'fix-coverage',
  inputSchema: z.object({
    targetFolder: z.string(),
    testScript: z.string(),
    coverageThreshold: z.number(),
    lowCoverageFiles: z.array(z.object({
      filePath: z.string(),
      stmts: z.number(),
      branch: z.number(),
      funcs: z.number(),
      lines: z.number(),
      uncoveredLines: z.string(),
    })),
  }),
  outputSchema: z.object({
    result: z.string(),
    improvedFiles: z.array(z.object({
      filePath: z.string(),
      testFilePath: z.string(),
      isImproved: z.boolean(),
    })),
  }),
  execute: async ({ inputData }) => {
    const { targetFolder, testScript, lowCoverageFiles } = inputData;

    if (lowCoverageFiles.length === 0) {
      return {
        result: 'All files meet the coverage threshold',
        improvedFiles: []
      };
    }

    console.log(`Fixing coverage for ${lowCoverageFiles.length} files`);

    const improvementResults = await Promise.all(lowCoverageFiles.map(async fileInfo => {
      console.log(`Processing file: ${fileInfo.filePath}`);
      const run = improveCoverageWorkflow.createRun();
      const result = await run.start({
        inputData: {
          targetFolder,
          testScript,
          ...fileInfo
        },
      });
      return result.outputData;
    }));

    const successfullyImproved = improvementResults.filter(r => r.isImproved).length;

    return {
      result: `Improved coverage for ${successfullyImproved} out of ${lowCoverageFiles.length} files`,
      improvedFiles: improvementResults
    };
  }
});

// 最終的なワークフローをexport
export const coverageFixWorkflow = createWorkflow({
  id: 'coverage-fix',
  inputSchema: z.object({
    targetFolder: z.string(),
    testScript: z.string(),
    coverageThreshold: z.number().optional(),
  }),
  outputSchema: z.object({
    result: z.string(),
    improvedFiles: z.array(z.object({
      filePath: z.string(),
      testFilePath: z.string(),
      isImproved: z.boolean(),
    })),
  }),
  steps: [analyzeCodeCoverageStep, fixCoverageStep],
})
.then(analyzeCodeCoverageStep)
.then(fixCoverageStep)
.commit();
