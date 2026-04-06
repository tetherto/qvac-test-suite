import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { config as loadDotenv } from 'dotenv';
import { loadConfig } from '../../utils/config-loader.js';

interface BootstrapOptions {
  config: string;
}

export async function runBootstrap(options: BootstrapOptions) {
  try {
    const configDir = path.resolve(options.config);
    loadDotenv({ path: path.join(configDir, '.env') });

    console.log('🚀 Running desktop bootstrap\n');
    console.log(`📂 Config: ${configDir}`);

    const config = await loadConfig(configDir);

    if (!config.consumers.desktop) {
      throw new Error('No desktop consumer configuration found');
    }

    const consumerConfig = config.consumers.desktop;

    const entryAbs = path.resolve(configDir, consumerConfig.entry);
    const entryUrl = pathToFileURL(entryAbs).href;
    const mod = await import(entryUrl);

    const bootstrap = typeof mod.bootstrap === 'function' ? mod.bootstrap : undefined;

    if (!bootstrap) {
      console.log('⚠️  No bootstrap function exported from consumer entry — nothing to do');
      process.exit(0);
    }

    console.log('🔧 Running bootstrap...');
    const start = Date.now();
    await bootstrap();
    console.log(`🔧 Bootstrap completed in ${Date.now() - start}ms`);

    process.exit(0);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`❌ Bootstrap failed: ${errorMessage}`);
    process.exit(1);
  }
}
