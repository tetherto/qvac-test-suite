# Shared Test Executor

Shared test execution logic between desktop and mobile test consumers.

## Structure

- `test-executor-base.ts` - Base class with all ~100 test handler methods

## Pattern

Follows the same pattern as `shared-consumer/`:

```typescript
export abstract class TestExecutorBase {
  constructor(sdk: SDKFunctions) { /* Inject SDK functions */ }
  
  // Platform-specific methods to implement
  protected abstract getSharedDataPath(): string;
  protected abstract readDocumentFile(filePath: string): Promise<string> | string;
  protected abstract getAudioFilePath(filename: string): string;
}
```

## Platform Implementations

**Desktop:**
- Uses `fs.readFileSync()` for file reading
- Direct file paths

**Mobile:**
- Uses `expo-file-system` for file reading  
- Asset system for audio files with `require()` mappings

## Benefits

- **3,300 lines** of duplication eliminated
- Single place to update test logic
- Consistent behavior across platforms
- Easy to maintain and extend

