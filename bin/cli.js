#!/usr/bin/env node
// Root CLI with multiple subcommands
const { program } = require('commander');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

function ensureExecutable(file) {
  try {
    const stat = fs.statSync(file);
    if ((stat.mode & 0o100) === 0) fs.chmodSync(file, 0o755);
  } catch (_) {}
}

program.name('jr').description('JR scripts CLI').version('1.0.0');

// mknext subcommand -> invokes mknext.sh
program
  .command('mknext')
  .argument('<app-name>', 'App directory name')
  .description('Create a Next.js app with shadcn/ui and Prisma')
  .allowUnknownOption(true)
  .action((appName, _opts, cmd) => {
    const scriptPath = path.resolve(__dirname, '..', 'mknext.sh');
    ensureExecutable(scriptPath);
    const extraArgs = cmd.args.filter((a) => a !== appName);
    const child = spawn(scriptPath, [appName, ...extraArgs], {
      stdio: 'inherit',
      env: process.env,
    });
    child.on('close', (code) => process.exit(code ?? 0));
  });

// secondary command example
// program
//   .command('helloworld')
//   .description('Prints Hello, World! or a personalized greeting')
//   .option('-n, --name <name>', 'Name to greet')
//   .action((opts) => {
//     const msg = opts.name ? `Hello, ${opts.name}!` : 'Hello, world!';
//     console.log(msg);
//   });

program.parse(process.argv);
