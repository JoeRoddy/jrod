import { spawn } from 'child_process';
import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import { isDevEnvironment, renderTemplates } from '@/utils';

export const mkNextCommand = new Command('mknext')
  .argument('<app-name>', 'App directory name')
  .description('Create a Next.js app with shadcn/ui and Prisma')
  .allowUnknownOption(true)
  .action(async (appName: string) => {
    try {
      await mkNextApp(appName);
    } catch (err: any) {
      console.error('mknext failed:', err.message || err);
      process.exit(1);
    }
  });

type RunOptions = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  input?: string; // data to write to stdin then end
  allowFail?: boolean; // do not throw on non‑zero exit
};

function run(
  cmd: string,
  args: string[],
  opts: RunOptions = {},
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      env: { ...process.env, ...opts.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('error', (err) => reject(err));
    child.on('close', (code) => {
      if (code !== 0 && !opts.allowFail) {
        return reject(new Error(`${cmd} ${args.join(' ')} exited with code ${code}\n${stderr}`));
      }
      resolve({ code, stdout, stderr });
    });
    if (opts.input) {
      child.stdin.write(opts.input);
      child.stdin.end();
    } else {
      child.stdin.end();
    }
  });
}

async function runInherit(cmd: string, args: string[], opts: { cwd?: string; env?: NodeJS.ProcessEnv } = {}) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: opts.cwd, env: { ...process.env, ...opts.env }, stdio: 'inherit' });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(`${cmd} ${args.join(' ')} failed with code ${code}`));
      resolve();
    });
  });
}

const mkNextApp = async (appName: string) => {
  if (!appName) {
    throw new Error('Error: provide a project directory name. Usage: mknext <app-name>');
  }

  // Basic sanity checks (Node & npm assumed present if script runs)
  if (!process.version) throw new Error('Node.js runtime not detected');
  // confirm npm presence by invoking --version quickly
  try {
    await run('npm', ['--version'], { allowFail: false });
  } catch {
    throw new Error('npm not found on PATH');
  }

  console.log(`▶ Creating Next.js app: ${appName}`);
  await runInherit('npx', ['create-next-app@latest', appName, '--yes', '--use-npm']);

  const projectDir = path.resolve(process.cwd(), appName);

  fs.appendFileSync(path.join(projectDir, '.gitignore'), '\n.env.*.local');

  console.log('▶ Initializing shadcn/ui (non-interactive)');
  await runInherit('npx', ['--yes', 'shadcn@latest', 'init', '-y', '--template', 'next', '--base-color', 'neutral'], {
    cwd: projectDir,
  });

  console.log('▶ Adding ALL shadcn/ui components');
  await runInherit('npx', ['--yes', 'shadcn@latest', 'add', '--all', '-y'], { cwd: projectDir });

  console.log('▶ Installing additional dependencies (Prisma, better-auth)');
  await runInherit('npm', ['install', '-D', 'prisma'], { cwd: projectDir });
  await runInherit('npm', ['install', '@prisma/client', 'better-auth'], { cwd: projectDir });

  console.log('▶ Prisma init (PostgreSQL)');
  await runInherit('npx', ['prisma', 'init', '--datasource-provider', 'postgresql'], { cwd: projectDir });
  // empty the .env file crap dumped by prisma
  fs.writeFileSync(path.join(projectDir, '.env'), '');

  console.log('▶ Creating a temporary Prisma Postgres database (expires ~24h)');
  const createDb = await run('npx', ['--yes', 'create-db@latest'], { cwd: projectDir, allowFail: true });
  const dbUrlMatch = createDb.stdout.split(/\s+/).find((t) => t.startsWith('postgresql://')) || '';
  if (!dbUrlMatch) throw new Error('Failed to obtain a database URL from create-db.');

  console.log('▶ Adding template code');
  await renderTemplates({
    projectDir,
    templatesDir: path.join(__dirname, 'templates'),
    variables: {
      '.env.local': {
        DATABASE_URL: dbUrlMatch,
      },
    },
  });

  console.log('▶ Prisma generate');
  await runInherit('npx', ['prisma', 'generate'], { cwd: projectDir });

  console.log('▶ Running better-auth CLI generate (auto-confirm)');
  await run('npx', ['@better-auth/cli@latest', 'generate'], { cwd: projectDir, input: 'y\n', allowFail: true });

  console.log('▶ Pushing Prisma schema to remote database');
  await runInherit('npx', ['env-cmd', '-f', '.env.local', 'prisma', 'db', 'push'], { cwd: projectDir });

  if (isDevEnvironment()) {
    console.log('▶ Skipping git commit (dev mode detected)');
  } else {
    console.log('▶ Committing changes to git');
    try {
      await run('git', ['add', '.'], { cwd: projectDir });
      await run('git', ['commit', '-m', 'Initial commit from mknext script'], { cwd: projectDir, allowFail: true });
    } catch (e) {
      console.warn('Git commit skipped or failed:', (e as Error).message);
    }
  }

  console.log('▶ Opening VS Code');
  try {
    if (process.platform === 'darwin') {
      await run('open', ['-a', 'Visual Studio Code', '.'], { cwd: projectDir, allowFail: true });
    } else if (process.platform === 'win32') {
      await run('cmd', ['/c', 'start', 'code', '.'], { cwd: projectDir, allowFail: true });
    } else {
      // linux / others
      await run('code', ['.'], { cwd: projectDir, allowFail: true });
    }
  } catch (_) {
    console.warn('Could not automatically open the project.');
  }

  console.log('\n✅ Project bootstrapped successfully. Next steps:');
  console.log(`  cd ${appName}`);
  console.log('  npm run dev');
};
