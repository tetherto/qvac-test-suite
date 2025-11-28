import { z } from 'zod';
/**
 * Union of all expectation types
 */
export declare const expectationSchema: z.ZodUnion<[z.ZodObject<{
    validation: z.ZodEnum<["contains-all", "contains-any"]>;
    contains: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    validation: "contains-all" | "contains-any";
    contains: string[];
}, {
    validation: "contains-all" | "contains-any";
    contains: string[];
}>, z.ZodObject<{
    validation: z.ZodLiteral<"regex">;
    pattern: z.ZodString;
}, "strip", z.ZodTypeAny, {
    validation: "regex";
    pattern: string;
}, {
    validation: "regex";
    pattern: string;
}>, z.ZodObject<{
    validation: z.ZodLiteral<"numeric-range">;
    min: z.ZodOptional<z.ZodNumber>;
    max: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    validation: "numeric-range";
    min?: number | undefined;
    max?: number | undefined;
}, {
    validation: "numeric-range";
    min?: number | undefined;
    max?: number | undefined;
}>, z.ZodObject<{
    validation: z.ZodLiteral<"type">;
    expectedType: z.ZodEnum<["string", "number", "array", "embedding"]>;
    minDimensions: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    validation: "type";
    expectedType: "string" | "number" | "array" | "embedding";
    minDimensions?: number | undefined;
}, {
    validation: "type";
    expectedType: "string" | "number" | "array" | "embedding";
    minDimensions?: number | undefined;
}>, z.ZodObject<{
    validation: z.ZodLiteral<"throws-error">;
    errorContains: z.ZodString;
}, "strip", z.ZodTypeAny, {
    validation: "throws-error";
    errorContains: string;
}, {
    validation: "throws-error";
    errorContains: string;
}>, z.ZodObject<{
    validation: z.ZodLiteral<"custom">;
    validator: z.ZodFunction<z.ZodTuple<[z.ZodAny], z.ZodUnknown>, z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    validation: "custom";
    validator: (args_0: any, ...args: unknown[]) => boolean;
}, {
    validation: "custom";
    validator: (args_0: any, ...args: unknown[]) => boolean;
}>]>;
export type Expectation = z.infer<typeof expectationSchema>;
/**
 * Test definition schema
 */
export declare const testDefinitionSchema: z.ZodObject<{
    testId: z.ZodString;
    params: z.ZodAny;
    expectation: z.ZodUnion<[z.ZodObject<{
        validation: z.ZodEnum<["contains-all", "contains-any"]>;
        contains: z.ZodArray<z.ZodString, "many">;
    }, "strip", z.ZodTypeAny, {
        validation: "contains-all" | "contains-any";
        contains: string[];
    }, {
        validation: "contains-all" | "contains-any";
        contains: string[];
    }>, z.ZodObject<{
        validation: z.ZodLiteral<"regex">;
        pattern: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        validation: "regex";
        pattern: string;
    }, {
        validation: "regex";
        pattern: string;
    }>, z.ZodObject<{
        validation: z.ZodLiteral<"numeric-range">;
        min: z.ZodOptional<z.ZodNumber>;
        max: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        validation: "numeric-range";
        min?: number | undefined;
        max?: number | undefined;
    }, {
        validation: "numeric-range";
        min?: number | undefined;
        max?: number | undefined;
    }>, z.ZodObject<{
        validation: z.ZodLiteral<"type">;
        expectedType: z.ZodEnum<["string", "number", "array", "embedding"]>;
        minDimensions: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        validation: "type";
        expectedType: "string" | "number" | "array" | "embedding";
        minDimensions?: number | undefined;
    }, {
        validation: "type";
        expectedType: "string" | "number" | "array" | "embedding";
        minDimensions?: number | undefined;
    }>, z.ZodObject<{
        validation: z.ZodLiteral<"throws-error">;
        errorContains: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        validation: "throws-error";
        errorContains: string;
    }, {
        validation: "throws-error";
        errorContains: string;
    }>, z.ZodObject<{
        validation: z.ZodLiteral<"custom">;
        validator: z.ZodFunction<z.ZodTuple<[z.ZodAny], z.ZodUnknown>, z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        validation: "custom";
        validator: (args_0: any, ...args: unknown[]) => boolean;
    }, {
        validation: "custom";
        validator: (args_0: any, ...args: unknown[]) => boolean;
    }>]>;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
}, "strip", z.ZodTypeAny, {
    testId: string;
    expectation: {
        validation: "contains-all" | "contains-any";
        contains: string[];
    } | {
        validation: "regex";
        pattern: string;
    } | {
        validation: "numeric-range";
        min?: number | undefined;
        max?: number | undefined;
    } | {
        validation: "type";
        expectedType: "string" | "number" | "array" | "embedding";
        minDimensions?: number | undefined;
    } | {
        validation: "throws-error";
        errorContains: string;
    } | {
        validation: "custom";
        validator: (args_0: any, ...args: unknown[]) => boolean;
    };
    params?: any;
    metadata?: Record<string, any> | undefined;
}, {
    testId: string;
    expectation: {
        validation: "contains-all" | "contains-any";
        contains: string[];
    } | {
        validation: "regex";
        pattern: string;
    } | {
        validation: "numeric-range";
        min?: number | undefined;
        max?: number | undefined;
    } | {
        validation: "type";
        expectedType: "string" | "number" | "array" | "embedding";
        minDimensions?: number | undefined;
    } | {
        validation: "throws-error";
        errorContains: string;
    } | {
        validation: "custom";
        validator: (args_0: any, ...args: unknown[]) => boolean;
    };
    params?: any;
    metadata?: Record<string, any> | undefined;
}>;
export type TestDefinition = z.infer<typeof testDefinitionSchema>;
/**
 * Helper function to define tests with type safety and validation
 */
export declare function defineTests(tests: TestDefinition[]): TestDefinition[];
