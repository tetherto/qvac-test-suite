import { pathToFileURL } from 'url';
import * as path from 'path';
import * as fs from 'fs';
/**
 * Load configuration from qvac-test.config.ts
 * @param configDir Directory containing qvac-test.config.ts (defaults to cwd)
 */
export async function loadConfig(configDir = process.cwd()) {
    const tsConfigPath = path.resolve(configDir, 'qvac-test.config.ts');
    const jsConfigPath = path.resolve(configDir, 'qvac-test.config.js');
    let configPath;
    if (fs.existsSync(jsConfigPath)) {
        configPath = jsConfigPath;
    }
    else if (fs.existsSync(tsConfigPath)) {
        configPath = tsConfigPath;
    }
    else {
        throw new Error(`Config file not found in ${configDir} (looking for qvac-test.config.ts or .js)`);
    }
    try {
        const configUrl = pathToFileURL(configPath).href;
        const module = await import(configUrl);
        return module.default;
    }
    catch (error) {
        throw new Error(`Failed to load config from ${configPath}: ${error.message}`);
    }
}
/**
 * Find config file by walking up directory tree
 */
export function findConfig(startDir = process.cwd()) {
    let currentDir = path.resolve(startDir);
    const root = path.parse(currentDir).root;
    while (currentDir !== root) {
        const tsConfigPath = path.join(currentDir, 'qvac-test.config.ts');
        const jsConfigPath = path.join(currentDir, 'qvac-test.config.js');
        if (fs.existsSync(tsConfigPath) || fs.existsSync(jsConfigPath)) {
            return currentDir;
        }
        currentDir = path.dirname(currentDir);
    }
    return null;
}
