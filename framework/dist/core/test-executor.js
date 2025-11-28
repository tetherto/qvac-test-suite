/**
 * Creates a test executor from a configuration of handlers
 */
export function createExecutor(config) {
    return new DefaultTestExecutor(config.handlers);
}
/**
 * Default test executor implementation
 */
class DefaultTestExecutor {
    handlers;
    constructor(handlers) {
        this.handlers = handlers;
    }
    async executeTest(testId, modelId, params, expectation) {
        // Find matching handler
        const handler = this.handlers.find(h => h.pattern.test(testId));
        if (!handler) {
            return {
                passed: false,
                output: `No handler found for test: ${testId}. Registered patterns: ${this.handlers.map(h => h.pattern.source).join(', ')}`
            };
        }
        try {
            return await handler.execute(testId, modelId, params, expectation);
        }
        catch (error) {
            return {
                passed: false,
                output: `Handler execution failed: ${error.message || String(error)}`
            };
        }
    }
}
