// Real SDK tests - Model Loading Category
import type { TestDefinition } from '@tetherto/qvac-test-suite';

// Model loading tests
export const modelLoadLlm: TestDefinition = {
  testId: 'model-load-llm',
  params: { modelType: 'llm', modelConstant: 'LLAMA_3_2_1B_INST_Q4_0' },
  expectation: { validation: 'type', expectedType: 'string' } as const,
  metadata: { category: 'model', dependency: 'none', estimatedDurationMs: 60000 },
} as const;

export const modelLoadEmbedding: TestDefinition = {
  testId: 'model-load-embedding',
  params: { modelType: 'embeddings', modelConstant: 'GTE_LARGE_FP16' },
  expectation: { validation: 'type', expectedType: 'string' } as const,
  metadata: { category: 'model', dependency: 'none', estimatedDurationMs: 60000 },
} as const;

export const modelLoadInvalid: TestDefinition = {
  testId: 'model-load-invalid',
  params: { modelType: 'llm', modelPath: '/invalid/path/nonexistent-model.gguf' },
  expectation: { validation: 'throws-error', errorContains: 'failed to locate' },
  metadata: { category: 'model', dependency: 'none', estimatedDurationMs: 5000 },
};

export const modelUnload: TestDefinition = {
  testId: 'model-unload',
  params: { shouldClearStorage: false },
  expectation: { validation: 'type', expectedType: 'string' },
  metadata: { category: 'model', dependency: 'llm', estimatedDurationMs: 5000 },
};

export const modelLoadConcurrent: TestDefinition = {
  testId: 'model-load-concurrent',
  params: {
    models: [
      { type: 'llm', constant: 'LLAMA_3_2_1B_INST_Q4_0' },
      { type: 'embeddings', constant: 'GTE_LARGE_FP16' },
    ],
  },
  expectation: { validation: 'type', expectedType: 'array' },
  metadata: { category: 'model', dependency: 'none', estimatedDurationMs: 120000, expectedCount: 2 },
};

export const modelReloadLlm: TestDefinition = {
  testId: 'model-reload-llm',
  params: { modelType: 'llm', modelConstant: 'LLAMA_3_2_1B_INST_Q4_0' },
  expectation: { validation: 'type', expectedType: 'string' },
  metadata: { category: 'model', dependency: 'llm', estimatedDurationMs: 15000 },
};

// Completion tests
export const completionStreaming: TestDefinition = {
  testId: 'completion-streaming',
  params: {
    history: [{ role: 'user', content: 'What is 2+2? Answer with only the number.' }],
    stream: true,
  },
  expectation: { validation: 'contains-all', contains: ['4'] },
  metadata: { category: 'completion', dependency: 'llm', estimatedDurationMs: 10000 },
};

// Export all tests as array
export const tests = [
  modelLoadLlm,
  modelLoadEmbedding,
  modelLoadInvalid,
  modelUnload,
  modelLoadConcurrent,
  modelReloadLlm,
  completionStreaming,
];
