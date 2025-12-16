import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawn } from 'node:child_process';
import { loadConfig } from '../../utils/config-loader.js';
import { buildConsumerDesktop } from './build-consumer-desktop.js';

interface ConsumerOptions {
  runId: string;
  mqttBroker?: string;
  config: string;
  platform?: string;
  rebuild?: boolean;
}

export async function runConsumerDesktop(options: ConsumerOptions) {
  try {
    const config = await loadConfig(options.config);

    if (!config.consumers.desktop) {
      throw new Error('No desktop consumer configuration found');
    }

    const platform = options.platform || 'desktop';
    const configDir = path.resolve(options.config);
    const outputDir = path.resolve(configDir, 'build/consumers', platform);
    const consumerPath = path.join(outputDir, 'consumer.js');

    const needsBuild = options.rebuild || !fs.existsSync(consumerPath) || shouldRebuild(configDir, outputDir);

    if (needsBuild) {
      console.log('🔨 Building consumer...\n');
      await buildConsumerDesktop({
        platform,
        config: options.config,
      });
      console.log('');
    }

    console.log('🚀 Running consumer...\n');

    const args = [`--runId=${options.runId}`];
    if (options.mqttBroker) {
      args.push(`--mqtt-broker=${options.mqttBroker}`);
    }

    const child = spawn('node', [consumerPath, ...args], {
      stdio: 'inherit',
      cwd: process.cwd(),
    });

    process.on('SIGINT', () => child.kill('SIGINT' as any));
    process.on('SIGTERM', () => child.kill('SIGTERM' as any));

    child.on('exit', (code) => {
      process.exit(code || 0);
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('❌ Failed to run consumer:', errorMessage);
    process.exit(1);
  }
}

function shouldRebuild(configDir: string, outputDir: string): boolean {
  const consumerPath = path.join(outputDir, 'consumer.js');

  if (!fs.existsSync(consumerPath)) {
    return true;
  }

  const consumerStat = fs.statSync(consumerPath);
  const testDir = path.join(configDir, 'tests');

  if (!fs.existsSync(testDir)) {
    return false;
  }

  const checkDirectory = (dir: string): boolean => {
    const entries = fs.readdirSync(dir, { withFileTypes: true }) as any[];

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (checkDirectory(fullPath)) return true;
      } else if (entry.isFile() && /\.(ts|tsx|js|jsx)$/.test(entry.name)) {
        const fileStat = fs.statSync(fullPath);
        if (fileStat.mtime > consumerStat.mtime) {
          return true;
        }
      }
    }

    return false;
  };

  return checkDirectory(testDir);
}
