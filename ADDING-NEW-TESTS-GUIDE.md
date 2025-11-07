# Guide: Adding New Tests to QVAC SDK Test Suite

**Quick Start for Phase 1 Critical Tests**

---

## 🎯 Priority Order (from Coverage Analysis)

1. **Tools/Function Calling** (20 tests) - 🔴 **P0 CRITICAL**
2. **Multimodal Vision** (10 tests) - 🔴 **P0 CRITICAL**  
3. **Text-to-Speech** (10 tests) - 🔴 **P0 CRITICAL**

---

## 📋 Step-by-Step: Adding Tools/Function Calling Tests

### Step 1: Research the Tools API

**Check SDK Examples:**
```bash
# Look at the SDK examples for tools usage
# https://github.com/tetherto/qvac-sdk/tree/main/examples
```

**Expected API format** (based on OpenAI-like patterns):
```typescript
// Example: LLM with function calling
const result = await llm.chat({
  messages: [
    { role: "user", content: "What's the weather in London?" }
  ],
  tools: [
    {
      type: "function",
      function: {
        name: "get_weather",
        description: "Get weather for a location",
        parameters: {
          type: "object",
          properties: {
            location: { type: "string" },
            unit: { type: "string", enum: ["celsius", "fahrenheit"] }
          },
          required: ["location"]
        }
      }
    }
  ]
});
```

### Step 2: Create Test Builders

**Add to `qvac-test-producer/test-builders.ts`:**

```typescript
// ========== TOOLS / FUNCTION CALLING TESTS ==========

buildToolsSimpleFunctionTest(): TestDefinition {
    return {
        testId: "tools-simple-function",
        payload: JSON.stringify({
            testId: "tools-simple-function",
            params: {
                history: [
                    { role: "user", content: "What's 25 degrees Celsius in Fahrenheit?" }
                ],
                tools: [
                    {
                        type: "function",
                        function: {
                            name: "convert_temperature",
                            description: "Convert temperature between units",
                            parameters: {
                                type: "object",
                                properties: {
                                    value: { type: "number" },
                                    from_unit: { type: "string", enum: ["celsius", "fahrenheit"] },
                                    to_unit: { type: "string", enum: ["celsius", "fahrenheit"] }
                                },
                                required: ["value", "from_unit", "to_unit"]
                            }
                        }
                    }
                ]
            },
            expectation: {
                type: "tool-call",
                validation: "contains-function-call",
                functionName: "convert_temperature",
                hasParameters: true
            },
            expectedOutcome: "pass",
        }),
        dependency: "llm",
        estimatedDurationMs: 15000,
    };
}

buildToolsMultipleFunctionsTest(): TestDefinition {
    return {
        testId: "tools-multiple-functions",
        payload: JSON.stringify({
            testId: "tools-multiple-functions",
            params: {
                history: [
                    { role: "user", content: "Get weather for London and calculate time difference with New York" }
                ],
                tools: [
                    {
                        type: "function",
                        function: {
                            name: "get_weather",
                            description: "Get current weather",
                            parameters: {
                                type: "object",
                                properties: {
                                    location: { type: "string" }
                                },
                                required: ["location"]
                            }
                        }
                    },
                    {
                        type: "function",
                        function: {
                            name: "get_time_difference",
                            description: "Calculate time difference between cities",
                            parameters: {
                                type: "object",
                                properties: {
                                    city1: { type: "string" },
                                    city2: { type: "string" }
                                },
                                required: ["city1", "city2"]
                            }
                        }
                    }
                ]
            },
            expectation: {
                type: "tool-calls",
                validation: "contains-multiple-function-calls",
                minFunctionCalls: 2
            },
            expectedOutcome: "pass",
        }),
        dependency: "llm",
        estimatedDurationMs: 20000,
    };
}

buildToolsParameterValidationTest(): TestDefinition {
    return {
        testId: "tools-parameter-validation",
        payload: JSON.stringify({
            testId: "tools-parameter-validation",
            params: {
                history: [
                    { role: "user", content: "Add 15 and 30" }
                ],
                tools: [
                    {
                        type: "function",
                        function: {
                            name: "calculator",
                            description: "Perform arithmetic operations",
                            parameters: {
                                type: "object",
                                properties: {
                                    operation: { type: "string", enum: ["add", "subtract", "multiply", "divide"] },
                                    num1: { type: "number" },
                                    num2: { type: "number" }
                                },
                                required: ["operation", "num1", "num2"]
                            }
                        }
                    }
                ]
            },
            expectation: {
                type: "tool-call",
                validation: "function-parameters-valid",
                functionName: "calculator",
                expectedParams: {
                    operation: "add",
                    num1: 15,
                    num2: 30
                }
            },
            expectedOutcome: "pass",
        }),
        dependency: "llm",
        estimatedDurationMs: 15000,
    };
}

buildToolsErrorHandlingTest(): TestDefinition {
    return {
        testId: "tools-error-handling",
        payload: JSON.stringify({
            testId: "tools-error-handling",
            params: {
                history: [
                    { role: "user", content: "Call a function that doesn't exist" }
                ],
                tools: [
                    {
                        type: "function",
                        function: {
                            name: "real_function",
                            description: "A real function",
                            parameters: {
                                type: "object",
                                properties: {
                                    input: { type: "string" }
                                }
                            }
                        }
                    }
                ],
                tool_choice: "nonexistent_function"  // Force error
            },
            expectation: {
                type: "error",
                validation: "throws-error",
                errorContains: "function"
            },
            expectedOutcome: "pass",
        }),
        dependency: "llm",
        estimatedDurationMs: 10000,
    };
}
```

### Step 3: Implement Test Executors

**Update `qvac-test-consumer-desktop/test-executor.ts`:**

```typescript
// Add to existing runCompletion function or create runToolsCompletion

async function runToolsCompletion(
    params: any,
    llm: any,
    testId: string
): Promise<TestResult> {
    try {
        const startTime = Date.now();
        
        const result = await llm.chat({
            messages: params.history || [],
            tools: params.tools || [],
            tool_choice: params.tool_choice || "auto",
            stream: false
        });
        
        const duration = Date.now() - startTime;
        
        // Extract tool calls from result
        const toolCalls = result.tool_calls || [];
        
        return {
            testId,
            status: "pass",
            message: `Tool calling completed: ${toolCalls.length} calls`,
            duration,
            details: {
                toolCalls,
                response: result
            }
        };
    } catch (error) {
        return {
            testId,
            status: "fail",
            message: error.message,
            error: String(error)
        };
    }
}
```

### Step 4: Register Tests

**In `test-builders.ts`, add to your test registry:**

```typescript
export function getAllTests(): TestDefinition[] {
    const builder = new TestBuilder();
    return [
        // ... existing tests ...
        
        // Tools / Function Calling Tests (NEW)
        builder.buildToolsSimpleFunctionTest(),
        builder.buildToolsMultipleFunctionsTest(),
        builder.buildToolsParameterValidationTest(),
        builder.buildToolsErrorHandlingTest(),
        builder.buildToolsOptionalParamsTest(),
        builder.buildToolsNestedCallsTest(),
        builder.buildToolsStreamingTest(),
        builder.buildToolsWithSystemMessageTest(),
        builder.buildToolsMultiTurnTest(),
        builder.buildToolsTimeoutTest(),
        builder.buildToolsParallelCallsTest(),
        builder.buildToolsChoiceAutoTest(),
        builder.buildToolsChoiceNoneTest(),
        builder.buildToolsChoiceSpecificTest(),
        builder.buildToolsInvalidSchemaTest(),
        builder.buildToolsMissingRequiredParamTest(),
        builder.buildToolsComplexObjectParamTest(),
        builder.buildToolsArrayParamTest(),
        builder.buildToolsEnumValidationTest(),
        builder.buildToolsResultValidationTest(),
    ];
}
```

---

## 🖼️ Adding Multimodal Vision Tests

### Step 1: Create Test Images

**Add to `shared-test-data/images/`:**
- `simple-object.jpg` - Simple object (chair, apple, etc.)
- `multiple-objects.jpg` - Multiple objects scene
- `text-in-image.jpg` - Image with visible text
- `diagram.jpg` - Simple diagram or chart
- `complex-scene.jpg` - Complex scene
- `corrupted-image.jpg` - Corrupted file for error testing

### Step 2: Vision Test Builder Example

```typescript
buildVisionSimpleImageTest(): TestDefinition {
    return {
        testId: "vision-simple-image",
        payload: JSON.stringify({
            testId: "vision-simple-image",
            params: {
                history: [
                    { 
                        role: "user", 
                        content: [
                            { type: "text", text: "What do you see in this image?" },
                            { type: "image_url", image_url: { url: "./shared-test-data/images/simple-object.jpg" } }
                        ]
                    }
                ]
            },
            expectation: {
                type: "completion",
                validation: "contains-description",
                minLength: 20
            },
            expectedOutcome: "pass",
        }),
        dependency: "llm",  // Assumes multimodal LLM loaded
        estimatedDurationMs: 30000,
    };
}

buildVisionMultipleImagesTest(): TestDefinition {
    return {
        testId: "vision-multiple-images",
        payload: JSON.stringify({
            testId: "vision-multiple-images",
            params: {
                history: [
                    { 
                        role: "user", 
                        content: [
                            { type: "text", text: "Compare these two images" },
                            { type: "image_url", image_url: { url: "./shared-test-data/images/image1.jpg" } },
                            { type: "image_url", image_url: { url: "./shared-test-data/images/image2.jpg" } }
                        ]
                    }
                ]
            },
            expectation: {
                type: "completion",
                validation: "contains-comparison"
            },
            expectedOutcome: "pass",
        }),
        dependency: "llm",
        estimatedDurationMs: 45000,
    };
}
```

---

## 🔊 Adding Text-to-Speech Tests

### Step 1: TTS Test Builder Example

```typescript
buildTtsBasicTest(): TestDefinition {
    return {
        testId: "tts-basic",
        payload: JSON.stringify({
            testId: "tts-basic",
            params: {
                text: "Hello, this is a test of text to speech synthesis.",
                voice: "default"
            },
            expectation: {
                type: "audio-generated",
                validation: "audio-file-exists",
                minDuration: 2000  // milliseconds
            },
            expectedOutcome: "pass",
        }),
        dependency: "tts",  // New dependency type
        estimatedDurationMs: 15000,
    };
}

buildTtsCustomVoiceTest(): TestDefinition {
    return {
        testId: "tts-custom-voice",
        payload: JSON.stringify({
            testId: "tts-custom-voice",
            params: {
                text: "This uses a custom voice",
                voice: "custom_voice_1",
                voiceData: "./shared-test-data/voices/custom_voice.bin"
            },
            expectation: {
                type: "audio-generated",
                validation: "audio-file-exists"
            },
            expectedOutcome: "pass",
        }),
        dependency: "tts",
        estimatedDurationMs: 20000,
    };
}
```

---

## 📊 Testing Workflow

### 1. Write Test Builder
```typescript
// In test-builders.ts
buildNewFeatureTest(): TestDefinition { ... }
```

### 2. Add Test Executor Logic
```typescript
// In test-executor.ts (consumer)
async function runNewFeature(params, models, testId) { ... }
```

### 3. Update Test Registry
```typescript
// In test-builders.ts
getAllTests() {
    return [
        // ... existing ...
        builder.buildNewFeatureTest(),
    ];
}
```

### 4. Run Tests
```bash
# Terminal 1: MQTT Broker
node mqtt-websocket-broker.cjs

# Terminal 2: Producer
cd qvac-test-producer
bun run orchestrate

# Terminal 3: Consumer
cd qvac-test-consumer-desktop
bun run batch
```

### 5. Check Results
```bash
# Generate HTML report
bun run batch:monitor
# Open: reports/batch-report-[timestamp].html
```

---

## 🔍 Finding Examples in SDK Repo

**To understand how to use features:**

1. **Check SDK API docs:**
   ```
   https://github.com/tetherto/qvac-sdk/tree/main/client/api
   ```

2. **Look at examples:**
   ```
   https://github.com/tetherto/qvac-sdk/tree/main/examples
   ```

3. **Search for TypeScript interfaces:**
   ```typescript
   // Look for types like:
   interface ToolCall { ... }
   interface ChatCompletionMessage { ... }
   interface ImageContent { ... }
   ```

---

## ✅ Test Checklist (For Each New Feature)

- [ ] Research feature API from SDK docs/examples
- [ ] Create test data files (if needed)
- [ ] Write test builder function
- [ ] Implement executor logic
- [ ] Add to test registry
- [ ] Run locally and verify
- [ ] Check pass/fail logic
- [ ] Add error handling test
- [ ] Document expected behavior
- [ ] Commit with descriptive message

---

## 🚀 Next Steps

1. **Start with Tools** (20 tests) - Marco's concern
2. **Add Multimodal** (10 tests) - Sep 1 feature
3. **Implement TTS** (10 tests) - Sep 20 feature
4. **Review with team** before moving to Phase 2

---

## 📚 Reference Documents

- **Coverage Analysis:** `TEST-COVERAGE-ANALYSIS.md`
- **PRD:** `C:\Users\alana\Downloads\QVAC SDK v1 - PRD.txt`
- **SDK API:** https://github.com/tetherto/qvac-sdk/tree/main/client/api
- **SDK Examples:** https://github.com/tetherto/qvac-sdk/tree/main/examples
- **Current Tests:** `qvac-test-producer/test-builders.ts`

---

**Questions?** Ask Simon, Opanin, or check the SDK examples!

**Generated:** November 7, 2024  
**Author:** QA Team

