import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { QvacTestConfig } from '../types/config.js';
import type { TestDefinition } from '../types/test-definition.js';

/**
 * Load test definitions from configuration
 * @param config Test suite configuration
 * @param configDir Directory where config was loaded from
 */
export async function loadTests(config: QvacTestConfig, configDir: string = process.cwd()): Promise<TestDefinition[]> {
  const testDir = path.resolve(configDir, config.testDir);

  if (!fs.existsSync(testDir)) {
    throw new Error(`Test directory not found: ${testDir}`);
  }

  // Look for test-definitions.ts or test-definitions.js
  const tsPath = path.join(testDir, 'test-definitions.ts');
  const jsPath = path.join(testDir, 'test-definitions.js');

  let definitionsPath: string;

  if (fs.existsSync(jsPath)) {
    definitionsPath = jsPath;
  } else if (fs.existsSync(tsPath)) {
    definitionsPath = tsPath;
  } else {
    throw new Error(`Test definitions not found in ${testDir} (looking for test-definitions.ts or .js)`);
  }

  try {
    const fileUrl = pathToFileURL(definitionsPath).href;
    const module = await import(fileUrl);

    // Look for 'tests' export or default export
    const tests = module.tests || module.default;

    if (!tests || !Array.isArray(tests)) {
      throw new Error(`Test definitions must export 'tests' array or default array`);
    }

    return tests;
  } catch (error: any) {
    throw new Error(`Failed to load test definitions from ${definitionsPath}: ${error.message}`);
  }
}
