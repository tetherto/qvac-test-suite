import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { build } from 'esbuild';
import { loadConfig } from '../../utils/config-loader.js';

interface BuildOptions {
  platform: string; // Just for output directory naming (default: 'desktop')
  config: string;
}

export async function buildConsumerDesktop(options: BuildOptions) {
  try {
    console.log(`🔨 Building desktop consumer for ${options.platform}\n`);

    // Load configuration
    const config = await loadConfig(options.config);

    if (!config.consumers.desktop) {
      throw new Error('No desktop consumer configuration found');
    }

    const desktopConfig = config.consumers.desktop;

    // Resolve paths
    const configDir = path.resolve(options.config);
    const entryPath = path.resolve(configDir, desktopConfig.entry);
    const outputDir = path.resolve(configDir, '../build/consumers', options.platform);

    console.log(`📂 Entry point: ${desktopConfig.entry}`);
    console.log(`📦 Output directory: ${outputDir}\n`);

    // Create output directory
    fs.mkdirSync(outputDir, { recursive: true });

    // Handle dependencies
    if (desktopConfig.dependencies) {
      await installDependencies(configDir, outputDir, desktopConfig.dependencies);
    }

    // Create consumer wrapper entry point
    const wrapperPath = path.join(outputDir, '_consumer-wrapper.js');
    const wrapperCode = createConsumerWrapper(entryPath, configDir);
    console.log(`📝 Generated wrapper at: ${wrapperPath}`);
    fs.writeFileSync(wrapperPath, wrapperCode);

    // Debug: show first few lines
    console.log('📄 Wrapper imports:');
    console.log(wrapperCode.split('\n').slice(0, 6).join('\n'));

    // Bundle with esbuild (keep dependencies external)
    console.log('🔧 Bundling with esbuild...');
    await build({
      entryPoints: [wrapperPath],
      bundle: true,
      platform: 'node',
      target: 'node22',
      format: 'esm',
      outfile: path.join(outputDir, 'consumer.js'),
      external: [
        'mqtt',
        '@qvac/*', // Keep SDK in node_modules
        'expo-*', // React Native packages
        'react-native*',
      ],
      // Note: @tetherto/qvac-test-suite will be bundled into consumer
      sourcemap: true,
      banner: {
        js: '#!/usr/bin/env node',
      },
    });

    // Clean up temp file
    fs.unlinkSync(wrapperPath);

    // Make executable
    fs.chmodSync(path.join(outputDir, 'consumer.js'), 0o755);

    console.log(`\n✅ Consumer built successfully: ${outputDir}/consumer.js`);
    console.log(`\n📋 To run:`);
    console.log(`   node ${outputDir}/consumer.js --runId=<id> --mqtt-broker=<url>`);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('❌ Build failed:', errorMessage);
    process.exit(1);
  }
}

/**
 * Install dependencies for the consumer
 */
async function installDependencies(
  configDir: string,
  outputDir: string,
  dependencies: 'auto' | Record<string, string>
): Promise<void> {
  console.log('📦 Installing dependencies...');

  if (dependencies === 'auto') {
    // Read from package.json in config directory
    const pkgJsonPath = path.join(configDir, 'package.json');

    if (!fs.existsSync(pkgJsonPath)) {
      console.log('⚠️  No package.json found, skipping dependency installation');
      return;
    }

    const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
    const deps = { ...pkgJson.dependencies, ...pkgJson.devDependencies };

    // Create package.json in output
    const consumerPkgJson = {
      name: 'qvac-consumer',
      version: '1.0.0',
      type: 'module',
      dependencies: deps,
    };

    fs.writeFileSync(path.join(outputDir, 'package.json'), JSON.stringify(consumerPkgJson, null, 2));
  } else {
    // Manual dependencies
    const consumerPkgJson = {
      name: 'qvac-consumer',
      version: '1.0.0',
      type: 'module',
      dependencies,
    };

    fs.writeFileSync(path.join(outputDir, 'package.json'), JSON.stringify(consumerPkgJson, null, 2));
  }

  // Install dependencies
  console.log(`   Running npm install in ${outputDir}...`);
  execSync('npm install', {
    cwd: outputDir,
    stdio: 'inherit',
  });

  console.log('✅ Dependencies installed\n');
}

/**
 * Create consumer wrapper that imports executor and starts consumer
 */
function createConsumerWrapper(executorPath: string, configDir: string): string {
  // Resolve absolute paths for imports
  const absoluteExecutorPath = path.resolve(configDir, executorPath);

  // Get path to framework dist (where this file is running from)
  // This file is at: framework/dist/cli/commands/build-consumer-desktop.js
  // We need: framework/dist/core/consumer-base.js
  const currentFilePath = path.dirname(new URL(import.meta.url).pathname);
  const frameworkDistPath = path.resolve(currentFilePath, '../..'); // Up to dist/
  const consumerBasePath = path.join(frameworkDistPath, 'core/consumer-base.js');

  return `
import mqtt from 'mqtt';
import * as os from 'os';
import { ConsumerBase } from '${consumerBasePath}';
import { executor } from '${absoluteExecutorPath}';

// Parse CLI arguments
const args = process.argv.slice(2);
const getArg = (name) => {
  const arg = args.find(a => a.startsWith('--' + name + '='));
  return arg ? arg.split('=')[1] : null;
};

const runId = getArg('runId');
const mqttBroker = getArg('mqtt-broker') || 'mqtt://localhost:1883';

if (!runId) {
  console.error('❌ --runId is required');
  process.exit(1);
}

// Create consumer
const consumerId = \`consumer-desktop-\${os.hostname()}-\${Date.now()}\`;
const client = mqtt.connect(mqttBroker);

const consumer = new ConsumerBase(
  client,
  consumerId,
  'desktop',
  runId,
  executor,
  {
    log: (msg) => console.log(msg),
    updateStats: () => {},
    onShutdown: () => process.exit(0),
  }
);

consumer.setupMqttHandlers();

process.on('SIGINT', () => consumer.forceShutdown());
process.on('SIGTERM', () => consumer.forceShutdown());
`;
}
