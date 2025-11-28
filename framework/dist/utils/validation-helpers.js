/**
 * Validation helpers for common test expectations
 */
export class ValidationHelpers {
    /**
     * Validate a result against an expectation
     */
    static validate(result, expectation) {
        try {
            switch (expectation.validation) {
                case 'contains-all':
                    return this.validateContainsAll(result, expectation.contains);
                case 'contains-any':
                    return this.validateContainsAny(result, expectation.contains);
                case 'regex':
                    return this.validateRegex(result, expectation.pattern);
                case 'numeric-range':
                    return this.validateNumericRange(result, expectation.min, expectation.max);
                case 'type':
                    return this.validateType(result, expectation.expectedType, expectation.minDimensions);
                case 'throws-error':
                    return this.validateThrowsError(result, expectation.errorContains);
                case 'custom':
                    return this.validateCustom(result, expectation.validator);
                default:
                    return {
                        passed: false,
                        output: `Unknown validation type: ${expectation.validation}`
                    };
            }
        }
        catch (error) {
            return {
                passed: false,
                output: `Validation error: ${error.message || String(error)}`
            };
        }
    }
    static validateContainsAll(result, contains) {
        const text = String(result).toLowerCase();
        const missing = contains.filter(str => !text.includes(str.toLowerCase()));
        if (missing.length === 0) {
            return { passed: true, output: text };
        }
        return {
            passed: false,
            output: `Missing required strings: ${missing.join(', ')}. Got: ${text.substring(0, 200)}`
        };
    }
    static validateContainsAny(result, contains) {
        const text = String(result).toLowerCase();
        const found = contains.find(str => text.includes(str.toLowerCase()));
        if (found) {
            return { passed: true, output: text };
        }
        return {
            passed: false,
            output: `None of the required strings found: ${contains.join(', ')}. Got: ${text.substring(0, 200)}`
        };
    }
    static validateRegex(result, pattern) {
        const text = String(result);
        const regex = new RegExp(pattern);
        if (regex.test(text)) {
            return { passed: true, output: text };
        }
        return {
            passed: false,
            output: `Text does not match pattern ${pattern}. Got: ${text.substring(0, 200)}`
        };
    }
    static validateNumericRange(result, min, max) {
        const num = typeof result === 'number' ? result : Number(result);
        if (isNaN(num)) {
            return {
                passed: false,
                output: `Expected number, got: ${String(result)}`
            };
        }
        if (min !== undefined && num < min) {
            return {
                passed: false,
                output: `Value ${num} is below minimum ${min}`
            };
        }
        if (max !== undefined && num > max) {
            return {
                passed: false,
                output: `Value ${num} is above maximum ${max}`
            };
        }
        return { passed: true, output: String(num) };
    }
    static validateType(result, expectedType, minDimensions) {
        const actualType = Array.isArray(result) ? 'array' : typeof result;
        if (expectedType === 'embedding') {
            if (!Array.isArray(result)) {
                return {
                    passed: false,
                    output: `Expected embedding (array), got ${actualType}`
                };
            }
            if (minDimensions && result.length < minDimensions) {
                return {
                    passed: false,
                    output: `Embedding has ${result.length} dimensions, expected at least ${minDimensions}`
                };
            }
            return {
                passed: true,
                output: `Embedding with ${result.length} dimensions`
            };
        }
        if (actualType !== expectedType) {
            return {
                passed: false,
                output: `Expected ${expectedType}, got ${actualType}`
            };
        }
        return {
            passed: true,
            output: `Type ${actualType} matches`
        };
    }
    static validateThrowsError(result, errorContains) {
        const text = String(result).toLowerCase();
        if (text.includes(errorContains.toLowerCase())) {
            return {
                passed: true,
                output: `Error contains expected text: ${errorContains}`
            };
        }
        return {
            passed: false,
            output: `Error does not contain "${errorContains}". Got: ${String(result).substring(0, 200)}`
        };
    }
    static validateCustom(result, validator) {
        try {
            const passed = validator(result);
            return {
                passed,
                output: passed ? String(result) : `Custom validation failed for: ${String(result).substring(0, 200)}`
            };
        }
        catch (error) {
            return {
                passed: false,
                output: `Custom validator threw error: ${error.message || String(error)}`
            };
        }
    }
}
