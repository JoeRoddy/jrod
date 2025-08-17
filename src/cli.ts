#!/usr/bin/env node
import { program } from 'commander';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import packageJson from '../package.json';

const PROGRAM_VERSION = packageJson.version || '0.0.0';

function ensureExecutable(file: string) {
  try {
    const stat = fs.statSync(file);
    if ((stat.mode & 0o100) === 0) fs.chmodSync(file, 0o755);
  } catch (_) {}
}

program.name('jrod').description('jrod scripts CLI').version(PROGRAM_VERSION);

program
  .command('mknext')
  .argument('<app-name>', 'App directory name')
  .description('Create a Next.js app with shadcn/ui and Prisma')
  .allowUnknownOption(true)
  .action((appName: string, _opts: any, cmd: any) => {
    const scriptPath = path.resolve(__dirname, '..', 'mknext.sh');
    ensureExecutable(scriptPath);
    const extraArgs = cmd.args.filter((a: string) => a !== appName);
    const child = spawn(scriptPath, [appName, ...extraArgs], {
      stdio: 'inherit',
      env: process.env,
    });
    child.on('close', (code: number | null) => process.exit(code ?? 0));
  });

program.parse(process.argv);
