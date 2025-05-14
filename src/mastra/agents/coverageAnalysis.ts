import { google } from "@ai-sdk/google";
import { Agent } from "@mastra/core/agent";

// このエージェントは、カバレッジレポートを分析し、
// カバレッジの低いファイルを特定するために使用されます。

export const coverageAnalysisAgent = new Agent({
  name: 'coverage-analysis-agent',
  instructions: `You are an expert at analyzing test coverage reports and identifying areas that need improvement.
Your task is to parse the provided test coverage report and extract information about files with low coverage.

Follow these steps:
1. Parse the coverage report to identify files that don't meet the specified threshold.
2. Extract the file path, statement coverage percentage, branch coverage percentage, function coverage percentage, line coverage percentage, and uncovered line numbers for each file.
3. Return the data in the requested JSON format.

Return only the JSON array with the requested information, nothing else.`,
  model: google('gemini-2.0-flash'),
});
