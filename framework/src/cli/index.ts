#!/usr/bin/env node

import { Command } from 'commander';
import { runConsumerDesktop } from './commands/run-consumer-desktop.js';
import { runProducer } from './commands/run-producer.js';

const program = new Command();

program.name('qvac-test').description('QVAC Test Suite - Distributed testing framework').version('0.1.0');

program
  .command('run:producer')
  .description('Start test producer/orchestrator')
  .option('--runId <id>', 'Unique run identifier')
  .option('--mqtt-broker <url>', 'MQTT broker URL', 'mqtt://localhost:1883')
  .option('--config <path>', 'Path to config directory', process.cwd())
  .action(runProducer);

program
  .command('run:consumer:desktop')
  .description('Start desktop test consumer')
  .requiredOption('--runId <id>', 'Unique run identifier (must match producer)')
  .option('--mqtt-broker <url>', 'MQTT broker URL', 'mqtt://localhost:1883')
  .option('--config <path>', 'Path to config directory', process.cwd())
  .action(runConsumerDesktop);

program.parse();
