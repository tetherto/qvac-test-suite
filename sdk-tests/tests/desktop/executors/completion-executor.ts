// Completion executor
import { completion, loadModel, LLAMA_3_2_1B_INST_Q4_0 } from '@qvac/sdk';
import { ValidationHelpers, type TestResult, type Expectation } from '@tetherto/qvac-test-suite';
import { completionStreaming } from '../../test-definitions.ts';

export class CompletionExecutor {
  pattern = /^completion-/;
  llmModelId: string | null = null;

  // Explicit mapping: testId → method
  handlers = {
    [completionStreaming.testId]: this.streaming,
  };

  async execute(testId: string, context: unknown, params: unknown, expectation: unknown): Promise<TestResult> {
    const handler = this.handlers[testId as keyof typeof this.handlers];
    if (handler) {
      return await (handler as (params: unknown, expectation: unknown) => Promise<TestResult>).call(
        this,
        params,
        expectation
      );
    }
    return { passed: false, output: `Unknown test: ${testId}` };
  }

  async streaming(
    params: typeof completionStreaming.params,
    expectation: typeof completionStreaming.expectation
  ): Promise<TestResult> {
    // Load model if needed
    if (!this.llmModelId) {
      console.log('    Loading LLM model...');
      this.llmModelId = await loadModel({
        modelSrc: LLAMA_3_2_1B_INST_Q4_0,
        modelType: 'llm',
        modelConfig: { verbosity: 0, ctx_size: 2048, n_discarded: 256 },
      });
    }

    // Run streaming completion
    const result = completion({ modelId: this.llmModelId, history: params.history, stream: true });

    let fullText = '';
    for await (const token of result.tokenStream) {
      fullText += token;
    }

    return ValidationHelpers.validate(fullText, expectation);
  }
}
