#!/usr/bin/env node
import { Command } from 'commander';
import { runProducer } from './commands/run-producer.js';
import { runConsumerDesktop } from './commands/run-consumer-desktop.js';
import { runBootstrap } from './commands/run-bootstrap.js';
import { buildConsumerMobile } from './commands/build-consumer-mobile.js';
import { reportCompare } from './commands/report-compare.js';
import { reportFormat } from './commands/report-format.js';
import { runLocalDesktop, runLocalAndroid, runLocalIos } from './commands/run-local.js';

const program = new Command();

program.name('qvac-test').description('QVAC Test Suite - Distributed testing framework').version('0.1.0');

program
  .command('run:producer')
  .description('Start test producer/orchestrator')
  .option('--runId <id>', 'Unique run identifier')
  .option('--mqtt-broker <url>', 'MQTT broker URL (overrides config)')
  .option('--config <path>', 'Path to config directory', process.cwd())
  .option('--consumer-timeout <seconds>', 'Timeout waiting for consumer connection (default: 30)', '30')
  .option('--consumer-inactivity-timeout <seconds>', 'Timeout for consumer inactivity/heartbeat (default: 120)', '120')
  .option(
    '--filter <categories>',
    'Filter tests by category or testId prefix (comma-separated, e.g., "model,completion")'
  )
  .option('--suite <suites>', 'Include only tests in these suites (comma-separated, e.g., "smoke,regression")')
  .option('--exclude-suite <suites>', 'Exclude tests in these suites (comma-separated, e.g., "slow,flaky")')
  .option(
    '--report-dir <dir>',
    'Directory to write reports + read device-mem.ndjson from (used by run:local; producer also writes test-timeline.ndjson here)'
  )
  .action(runProducer);

program
  .command('run:consumer:desktop')
  .description('Run desktop consumer (imports entry from config in-place)')
  .requiredOption('--runId <id>', 'Unique run identifier (must match producer)')
  .option('--mqtt-broker <url>', 'MQTT broker URL (overrides config)')
  .option('--config <path>', 'Path to config directory', process.cwd())
  .option('--platform <platform>', 'Platform name', 'desktop')
  .action(runConsumerDesktop);

program
  .command('run:bootstrap:desktop')
  .description('Run bootstrap from desktop consumer entry (e.g., pre-download models for CI caching)')
  .option('--config <path>', 'Path to config directory', process.cwd())
  .action(runBootstrap);

program
  .command('build:consumer:android')
  .description('Build Android consumer (.apk)')
  .option('--config <path>', 'Path to config directory', process.cwd())
  .option('--runId <id>', 'Bake runId into build (required for mobile)')
  .option('--mqtt-broker <url>', 'Override MQTT broker URL')
  .action((opts) => buildConsumerMobile({ ...opts, platform: 'android' }));

program
  .command('build:consumer:ios')
  .description('Build iOS consumer (.ipa)')
  .option('--config <path>', 'Path to config directory', process.cwd())
  .option('--runId <id>', 'Bake runId into build (required for mobile)')
  .option('--mqtt-broker <url>', 'Override MQTT broker URL')
  .action((opts) => buildConsumerMobile({ ...opts, platform: 'ios' }));

program
  .command('report:compare')
  .description('Compare test results between baseline and current')
  .requiredOption('--baseline <file>', 'Baseline JSON report file')
  .requiredOption('--current <file>', 'Current JSON report file')
  .requiredOption('--output <file>', 'Output comparison JSON file')
  .action(reportCompare);

program
  .command('report:format')
  .description('Format comparison JSON to markdown')
  .requiredOption('--input <file>', 'Comparison JSON file')
  .requiredOption('--format <format>', 'Output format (markdown)')
  .option('--output <file>', 'Output file (optional, prints to stdout if not specified)')
  .action(reportFormat);

// ---------------------------------------------------------------------------
// run:local:* — one-liner local development commands
// ---------------------------------------------------------------------------

const addLocalOpts = (cmd: Command) =>
  cmd
    .option('--config <path>', 'Path to config directory', process.cwd())
    .option('--runId <id>', 'Run identifier (auto-generated if omitted)')
    .option('--filter <categories>', 'Filter tests by category (forwarded to producer)')
    .option('--suite <suites>', 'Include only these suites (forwarded to producer)')
    .option('--exclude-suite <suites>', 'Exclude these suites (forwarded to producer)')
    .option('--report-dir <dir>', 'Custom report directory');

addLocalOpts(program.command('run:local:desktop'))
  .description('Run producer + desktop consumer locally (one command)')
  .action(runLocalDesktop);

addLocalOpts(program.command('run:local:android'))
  .description('Build, install, launch Android consumer + run producer locally')
  .option('--skip-build', 'Skip build, only install+launch existing APK')
  .option('--device <serial>', 'Target specific Android device')
  .action(runLocalAndroid);

addLocalOpts(program.command('run:local:ios'))
  .description('Build, install, launch iOS consumer + run producer locally')
  .option('--skip-build', 'Skip build, only install+launch existing .app')
  .option('--bundle-suffix <suffix>', 'iOS bundle ID suffix (default: OS username)')
  .option('--device <udid>', 'Target specific iOS device')
  .action(runLocalIos);

program.parse();
