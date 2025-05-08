import { google } from "@ai-sdk/google";
import { Agent } from "@mastra/core/agent";

export const relatedFileSearchAgent = new Agent({
  name: 'related-file-search',
  instructions: `You are a programming assistant. You will be given a test file name and its content. We want to fix this test file, so please find the files that are related to this test file and need to be fixed.
  Please return the file names in a JSON array format. For example, ["src/file1.ts", "src/file2.ts"]`,
  model: google('gemini-2.0-flash'),
});
