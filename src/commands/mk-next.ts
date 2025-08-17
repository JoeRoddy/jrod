import { spawn } from 'child_process';
import { Command } from 'commander';
import fs from 'fs';
import path from 'path';

function ensureExecutable(file: string) {
  try {
    const stat = fs.statSync(file);
    if ((stat.mode & 0o100) === 0) fs.chmodSync(file, 0o755);
  } catch (_) {}
}

// Export a standalone command instance to be added in the root CLI.
export const mkNextCommand = new Command('mknext')
  .argument('<app-name>', 'App directory name')
  .description('Create a Next.js app with shadcn/ui and Prisma')
  .allowUnknownOption(true)
  .action((appName: string, _opts: any, cmd: Command) => {
    // When compiled, __dirname => dist/commands. Script lives at repo root.
    const scriptPath = path.resolve(__dirname, '..', '..', 'mknext.sh');
    ensureExecutable(scriptPath);
    const extraArgs = cmd.args.filter((a: string) => a !== appName);
    const child = spawn(scriptPath, [appName, ...extraArgs], {
      stdio: 'inherit',
      env: process.env,
    });
    child.on('close', (code: number | null) => process.exit(code ?? 0));
  });
