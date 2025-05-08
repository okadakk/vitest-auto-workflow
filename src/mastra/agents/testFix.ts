import { google } from "@ai-sdk/google";
import { Agent } from "@mastra/core/agent";

export const testFixAgent = new Agent({
  name: 'test-fix-agent',
  instructions: `You are a programming assistant. You will be given a test file name and its content and related files. So please fix the test file and return the fixed code. Please return the code in a JSON format. For example, {"content": "fixed code"}`,
  model: google('gemini-2.5-pro-exp-03-25'),
});
