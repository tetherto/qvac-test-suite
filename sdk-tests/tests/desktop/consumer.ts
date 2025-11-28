// Desktop consumer entry point with SDK executors
import { createExecutor } from '@tetherto/qvac-test-suite';
import { CompletionExecutor } from './executors/completion-executor.js';
import { ModelLoadingExecutor } from './executors/model-loading-executor.js';

export const executor = createExecutor({
  handlers: [new ModelLoadingExecutor(), new CompletionExecutor()],
});
