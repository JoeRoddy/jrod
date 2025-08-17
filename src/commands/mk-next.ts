import { spawn } from 'child_process';
import { Command } from 'commander';
import fs from 'fs';
import path from 'path';

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
  // empty the .env file
  fs.writeFileSync(path.join(projectDir, '.env'), '');

  console.log('▶ Updating prisma/schema.prisma');
  const prismaSchema = `generator client {
  provider = "prisma-client-js"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  email String  @unique
  name  String?
  posts Post[]

  id        String   @id @default(cuid())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Post {
  title     String
  content   String?
  published Boolean @default(false)

  author   User   @relation(fields: [authorId], references: [id])
  authorId String

  id        String   @id @default(cuid())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}`;
  const prismaDir = path.join(projectDir, 'prisma');
  fs.mkdirSync(prismaDir, { recursive: true });
  fs.writeFileSync(path.join(prismaDir, 'schema.prisma'), prismaSchema);

  console.log('▶ Creating a temporary Prisma Postgres database (expires ~24h)');
  const createDb = await run('npx', ['--yes', 'create-db@latest'], { cwd: projectDir, allowFail: true });
  const dbUrlMatch = createDb.stdout.split(/\s+/).find((t) => t.startsWith('postgresql://')) || '';
  if (!dbUrlMatch) throw new Error('Failed to obtain a database URL from create-db.');

  const envLocalPath = path.join(projectDir, '.env.local');
  const envLocal = `DATABASE_URL=${dbUrlMatch}\nBETTER_AUTH_URL=http://localhost:3000\nBETTER_AUTH_SECRET=your_auth_secret\n`;
  fs.writeFileSync(envLocalPath, envLocal);

  console.log('▶ Configuring better-auth server code');
  const authLibDir = path.join(projectDir, 'src', 'lib');
  fs.mkdirSync(authLibDir, { recursive: true });
  const authTs = `import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { PrismaClient } from '@/generated/prisma';
import { nextCookies } from 'better-auth/next-js';
import { headers as getHeaders } from 'next/headers';

const prisma = new PrismaClient();

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  emailAndPassword: { enabled: true },
  // https://www.better-auth.com/docs/integrations/next#server-action-cookies
  plugins: [nextCookies()], // make sure this is the last plugin in the array
});

export const getServerSession = async (headers?: Headers) =>
  auth.api.getSession({ headers: headers || (await getHeaders()) });
`;
  fs.writeFileSync(path.join(authLibDir, 'auth.ts'), authTs);

  console.log('▶ Prisma generate');
  await runInherit('npx', ['prisma', 'generate'], { cwd: projectDir });

  console.log('▶ Running better-auth CLI generate (auto-confirm)');
  await run('npx', ['@better-auth/cli@latest', 'generate'], { cwd: projectDir, input: 'y\n', allowFail: true });

  console.log('▶ Pushing Prisma schema to remote database');
  await runInherit('npx', ['env-cmd', '-f', '.env.local', 'prisma', 'db', 'push'], { cwd: projectDir });

  // Write page.tsx & auth related UI files
  const pageTsx = `import { Button } from '@/components/ui/button';
import { auth, getServerSession } from '@/lib/auth';
import { headers as getHeaders } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';

export default async function Home() {
  const headers = await getHeaders();
  const user = await getServerSession(headers);

  return (
    <div className="h-screen w-full flex flex-col items-center justify-center text-3xl text-center">
      hello world
  <p className="text-sm">{user && 'Logged in as ' + user.user.email}</p>
      <div className="fixed top-5 right-5">
        {user ? (
          <Button
            variant="outline"
            onClick={async () => {
              'use server';
              auth.api.signOut({ headers });
              redirect('/sign-in');
            }}
          >
            Sign out
          </Button>
        ) : (
          <Link href="/sign-in">
            <Button>Sign in</Button>
          </Link>
        )}
      </div>
    </div>
  );
}`;
  const signIn = `import { EmailAuthForm } from "@/components/auth/email-auth-form";

export default function SignInPage() {
  return <EmailAuthForm mode="sign-in" />;
}`;
  const signUp = `import { EmailAuthForm } from "@/components/auth/email-auth-form";

export default function SignUpPage() {
  return <EmailAuthForm mode="sign-up" />;
}`;
  const emailAuthForm = `"use client";

import * as React from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

const baseSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

const signUpSchema = baseSchema.extend({
  name: z.string().min(2, "Name is required"),
});

export type EmailAuthMode = "sign-in" | "sign-up";

export function EmailAuthForm({ mode }: { mode: EmailAuthMode }) {
  const router = useRouter();
  const params = useSearchParams();
  const callback = params.get("callbackURL") ?? "/";

  const schema = mode === "sign-up" ? signUpSchema : baseSchema;
  type FormValues = z.infer<typeof schema>;

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: (mode === "sign-up"
      ? { email: "", password: "", name: "" }
      : { email: "", password: "" }) as any,
  });

  const [error, setError] = React.useState<string | null>(null);
  const [isSubmitting, setSubmitting] = React.useState(false);

  const onSubmit = async (values: FormValues) => {
    setError(null);
    setSubmitting(true);

    if (mode === "sign-in") {
      const { email, password } = values as z.infer<typeof baseSchema>;
      const { error } = await authClient.signIn.email(
        { email, password, callbackURL: callback },
        {
          onError: (ctx) => setError(ctx.error?.message ?? "Sign in failed"),
          onSuccess: () => router.push(callback),
        }
      );
      if (error) setError(error.message ?? "Sign in failed");
    } else {
      const { email, password, name } = values as z.infer<typeof signUpSchema>;
      const { error } = await authClient.signUp.email(
        { email, password, name, callbackURL: callback },
        {
          onError: (ctx) => setError(ctx.error?.message ?? "Sign up failed"),
          onSuccess: () => router.push(callback),
        }
      );
      if (error) setError(error.message ?? "Sign up failed");
    }

    setSubmitting(false);
  };

  const title = mode === "sign-in" ? "Sign in" : "Create account";
  const subtitle = mode === "sign-in" ? "Welcome back" : "Let’s get started";
  const submitLabel = mode === "sign-in" ? "Sign in" : "Sign up";
  const switchHref = mode === "sign-in" ? "/sign-up" : "/sign-in";
  const switchText = mode === "sign-in" ? "Sign up" : "Sign in";
  const switchPrompt =
    mode === "sign-in" ? "Don't have an account?" : "Already have an account?";

  return (
    <div className="mx-auto max-w-sm py-12">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="text-muted-foreground text-sm">{subtitle}</p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          {mode === "sign-up" && (
            <FormField
              control={form.control}
              name={"name" as any}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input autoComplete="name" placeholder="Your name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          <FormField
            control={form.control}
            name={"email" as any}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input inputMode="email" autoComplete="email" placeholder="you@example.com" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name={"password" as any}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Password</FormLabel>
                <FormControl>
                  <Input type="password" autoComplete={mode === "sign-in" ? "current-password" : "new-password"} placeholder="Your password" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {error ? (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          ) : null}

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? submitLabel + '...' : submitLabel}
          </Button>

          <div className="text-center text-sm">
            <span className="text-muted-foreground">{switchPrompt} </span>
            <Link href={switchHref} className="underline underline-offset-4">
              {switchText}
            </Link>
          </div>
        </form>
      </Form>
    </div>
  );
}
`;
  const authClientTs = `import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
    baseURL: process.env.BETTER_AUTH_URL
});
`;
  const apiRoute = `import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";
 
export const { POST, GET } = toNextJsHandler(auth);
`;

  function writeFile(rel: string, content: string) {
    const full = path.join(projectDir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  writeFile('src/app/page.tsx', pageTsx);
  writeFile('src/app/sign-in/page.tsx', signIn);
  writeFile('src/app/sign-up/page.tsx', signUp);
  writeFile('src/components/auth/email-auth-form.tsx', emailAuthForm);
  writeFile('src/lib/auth-client.ts', authClientTs);
  writeFile('src/app/api/auth/[...all]/route.ts', apiRoute);

  console.log('▶ Committing changes to git');
  try {
    await run('git', ['add', '.'], { cwd: projectDir });
    await run('git', ['commit', '-m', 'Initial commit from mknext script'], { cwd: projectDir, allowFail: true });
  } catch (e) {
    console.warn('Git commit skipped or failed:', (e as Error).message);
  }

  console.log('▶ Opening app in editor (best effort)');
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
