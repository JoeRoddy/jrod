#!/usr/bin/env node
// https://dev.to/larswaechter/path-aliases-with-typescript-in-nodejs-4353
import 'module-alias/register';
import { Command } from 'commander';
import packageJson from '../package.json';
import { mkNextCommand } from '@/commands/mk-next/mk-next';

const PROGRAM_VERSION = packageJson.version || '0.0.0';

const program = new Command().name('jrod').description('jrod scripts CLI').version(PROGRAM_VERSION);

program.addCommand(mkNextCommand);

program.parse(process.argv);
