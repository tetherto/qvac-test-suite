import { z } from 'zod';
/**
 * Main configuration schema for QVAC test suite
 */
export declare const qvacTestConfigSchema: z.ZodObject<{
    brokerUrl: z.ZodDefault<z.ZodString>;
    sourceRepo: z.ZodOptional<z.ZodString>;
    testDir: z.ZodString;
    runIdStrategy: z.ZodDefault<z.ZodOptional<z.ZodUnion<[z.ZodLiteral<"auto">, z.ZodLiteral<"manual">, z.ZodFunction<z.ZodTuple<[], z.ZodUnknown>, z.ZodUnknown>]>>>;
    consumers: z.ZodEffects<z.ZodObject<{
        desktop: z.ZodOptional<z.ZodObject<{
            platforms: z.ZodArray<z.ZodEnum<["macos", "windows", "linux", "ios", "android"]>, "many">;
            entry: z.ZodString;
            include: z.ZodArray<z.ZodString, "many">;
            dependencies: z.ZodOptional<z.ZodUnion<[z.ZodLiteral<"auto">, z.ZodRecord<z.ZodString, z.ZodString>]>>;
        }, "strip", z.ZodTypeAny, {
            platforms: ("macos" | "windows" | "linux" | "ios" | "android")[];
            entry: string;
            include: string[];
            dependencies?: "auto" | Record<string, string> | undefined;
        }, {
            platforms: ("macos" | "windows" | "linux" | "ios" | "android")[];
            entry: string;
            include: string[];
            dependencies?: "auto" | Record<string, string> | undefined;
        }>>;
        mobile: z.ZodOptional<z.ZodObject<{
            platforms: z.ZodArray<z.ZodEnum<["macos", "windows", "linux", "ios", "android"]>, "many">;
            entry: z.ZodString;
            include: z.ZodArray<z.ZodString, "many">;
            dependencies: z.ZodOptional<z.ZodUnion<[z.ZodLiteral<"auto">, z.ZodRecord<z.ZodString, z.ZodString>]>>;
        }, "strip", z.ZodTypeAny, {
            platforms: ("macos" | "windows" | "linux" | "ios" | "android")[];
            entry: string;
            include: string[];
            dependencies?: "auto" | Record<string, string> | undefined;
        }, {
            platforms: ("macos" | "windows" | "linux" | "ios" | "android")[];
            entry: string;
            include: string[];
            dependencies?: "auto" | Record<string, string> | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        desktop?: {
            platforms: ("macos" | "windows" | "linux" | "ios" | "android")[];
            entry: string;
            include: string[];
            dependencies?: "auto" | Record<string, string> | undefined;
        } | undefined;
        mobile?: {
            platforms: ("macos" | "windows" | "linux" | "ios" | "android")[];
            entry: string;
            include: string[];
            dependencies?: "auto" | Record<string, string> | undefined;
        } | undefined;
    }, {
        desktop?: {
            platforms: ("macos" | "windows" | "linux" | "ios" | "android")[];
            entry: string;
            include: string[];
            dependencies?: "auto" | Record<string, string> | undefined;
        } | undefined;
        mobile?: {
            platforms: ("macos" | "windows" | "linux" | "ios" | "android")[];
            entry: string;
            include: string[];
            dependencies?: "auto" | Record<string, string> | undefined;
        } | undefined;
    }>, {
        desktop?: {
            platforms: ("macos" | "windows" | "linux" | "ios" | "android")[];
            entry: string;
            include: string[];
            dependencies?: "auto" | Record<string, string> | undefined;
        } | undefined;
        mobile?: {
            platforms: ("macos" | "windows" | "linux" | "ios" | "android")[];
            entry: string;
            include: string[];
            dependencies?: "auto" | Record<string, string> | undefined;
        } | undefined;
    }, {
        desktop?: {
            platforms: ("macos" | "windows" | "linux" | "ios" | "android")[];
            entry: string;
            include: string[];
            dependencies?: "auto" | Record<string, string> | undefined;
        } | undefined;
        mobile?: {
            platforms: ("macos" | "windows" | "linux" | "ios" | "android")[];
            entry: string;
            include: string[];
            dependencies?: "auto" | Record<string, string> | undefined;
        } | undefined;
    }>;
    comparison: z.ZodOptional<z.ZodObject<{
        baselineRef: z.ZodDefault<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        baselineRef: string;
    }, {
        baselineRef?: string | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    brokerUrl: string;
    testDir: string;
    runIdStrategy: ((...args: unknown[]) => unknown) | "auto" | "manual";
    consumers: {
        desktop?: {
            platforms: ("macos" | "windows" | "linux" | "ios" | "android")[];
            entry: string;
            include: string[];
            dependencies?: "auto" | Record<string, string> | undefined;
        } | undefined;
        mobile?: {
            platforms: ("macos" | "windows" | "linux" | "ios" | "android")[];
            entry: string;
            include: string[];
            dependencies?: "auto" | Record<string, string> | undefined;
        } | undefined;
    };
    sourceRepo?: string | undefined;
    comparison?: {
        baselineRef: string;
    } | undefined;
}, {
    testDir: string;
    consumers: {
        desktop?: {
            platforms: ("macos" | "windows" | "linux" | "ios" | "android")[];
            entry: string;
            include: string[];
            dependencies?: "auto" | Record<string, string> | undefined;
        } | undefined;
        mobile?: {
            platforms: ("macos" | "windows" | "linux" | "ios" | "android")[];
            entry: string;
            include: string[];
            dependencies?: "auto" | Record<string, string> | undefined;
        } | undefined;
    };
    brokerUrl?: string | undefined;
    sourceRepo?: string | undefined;
    runIdStrategy?: ((...args: unknown[]) => unknown) | "auto" | "manual" | undefined;
    comparison?: {
        baselineRef?: string | undefined;
    } | undefined;
}>;
/**
 * Infer TypeScript type from schema
 */
export type QvacTestConfig = z.infer<typeof qvacTestConfigSchema>;
/**
 * Helper function to define config with type safety and validation
 */
export declare function defineConfig(config: QvacTestConfig): QvacTestConfig;
