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
    const outputDir = path.resolve(configDir, 'build/consumers', options.platform);

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
    fs.writeFileSync(wrapperPath, wrapperCode);

    console.log('🔧 Bundling with esbuild...');
    await build({
      entryPoints: [wrapperPath],
      bundle: true,
      platform: 'node',
      target: 'node22',
      format: 'esm',
      outfile: path.join(outputDir, 'consumer.js'),
      external: ['mqtt', 'dotenv', '@qvac/*', 'expo-*', 'react-native*'],
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

    const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8') as string);
    const deps = { ...pkgJson.dependencies, ...pkgJson.devDependencies };

    const consumerPkgJson = {
      name: 'qvac-consumer',
      version: '1.0.0',
      type: 'module',
      dependencies: {
        ...deps,
        dotenv: '^16.4.5',
      },
    };

    fs.writeFileSync(path.join(outputDir, 'package.json'), JSON.stringify(consumerPkgJson, null, 2));
  } else {
    const consumerPkgJson = {
      name: 'qvac-consumer',
      version: '1.0.0',
      type: 'module',
      dependencies: {
        ...dependencies,
        dotenv: '^16.4.5',
      },
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

function createConsumerWrapper(executorPath: string, configDir: string): string {
  const absoluteExecutorPath = path.resolve(configDir, executorPath);
  const currentFilePath = path.dirname(new URL(import.meta.url).pathname);
  const frameworkDistPath = path.resolve(currentFilePath, '../..');
  const consumerBasePath = path.join(frameworkDistPath, 'core/consumer-base.js');
  const mqttConnectionPath = path.join(frameworkDistPath, 'utils/mqtt-connection.js');
  const configLoaderPath = path.join(frameworkDistPath, 'utils/config-loader.js');

  return `
import { config as loadDotenv } from 'dotenv';
import * as os from 'node:os';
import { ConsumerBase } from '${consumerBasePath}';
import { createMqttClient, buildMqttConnectionConfig } from '${mqttConnectionPath}';
import { loadConfig } from '${configLoaderPath}';
import { executor } from '${absoluteExecutorPath}';

loadDotenv();

const args = process.argv.slice(2);
const getArg = (name) => {
  const arg = args.find(a => a.startsWith('--' + name + '='));
  return arg ? arg.split('=')[1] : null;
};

const runId = getArg('runId');
const mqttBrokerOverride = getArg('mqtt-broker');

if (!runId) {
  console.error('❌ --runId is required');
  process.exit(1);
}

const config = await loadConfig('${configDir}');
const mqttConfig = buildMqttConnectionConfig(config);

if (mqttBrokerOverride) {
  mqttConfig.brokerUrl = mqttBrokerOverride;
}

const client = createMqttClient(mqttConfig);
const consumerId = \`consumer-desktop-\${os.hostname()}-\${Date.now()}\`;

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
