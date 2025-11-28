import type { Expectation, TestResult } from '../types';
/**
 * Validation helpers for common test expectations
 */
export declare class ValidationHelpers {
    /**
     * Validate a result against an expectation
     */
    static validate(result: any, expectation: Expectation): TestResult;
    private static validateContainsAll;
    private static validateContainsAny;
    private static validateRegex;
    private static validateNumericRange;
    private static validateType;
    private static validateThrowsError;
    private static validateCustom;
}
