#!/usr/bin/env node

import { Command } from 'commander';
import { runProducer } from './commands/run-producer.js';
import { runConsumerDesktop } from './commands/run-consumer-desktop.js';
import { buildConsumerDesktop } from './commands/build-consumer-desktop.js';
import { reportCompare } from './commands/report-compare.js';
import { reportFormat } from './commands/report-format.js';

const program = new Command();

program.name('qvac-test').description('QVAC Test Suite - Distributed testing framework').version('0.1.0');

program
  .command('build:consumer:desktop')
  .description('Build desktop consumer package (works on all desktop platforms)')
  .option('--platform <platform>', 'Optional platform name for output directory', 'desktop')
  .option('--config <path>', 'Path to config directory', process.cwd())
  .action(buildConsumerDesktop);

program
  .command('run:producer')
  .description('Start test producer/orchestrator')
  .option('--runId <id>', 'Unique run identifier')
  .option('--mqtt-broker <url>', 'MQTT broker URL', 'mqtt://localhost:1883')
  .option('--config <path>', 'Path to config directory', process.cwd())
  .option(
    '--filter <categories>',
    'Filter tests by category or testId prefix (comma-separated, e.g., "model,completion")'
  )
  .action(runProducer);

program
  .command('run:consumer:desktop')
  .description('Start desktop test consumer')
  .requiredOption('--runId <id>', 'Unique run identifier (must match producer)')
  .option('--mqtt-broker <url>', 'MQTT broker URL', 'mqtt://localhost:1883')
  .option('--config <path>', 'Path to config directory', process.cwd())
  .action(runConsumerDesktop);

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

program.parse();
