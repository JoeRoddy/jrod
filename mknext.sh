#!/usr/bin/env bash
# mknext.sh
# Usage: ./mknext.sh my-app-name
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Error: provide a project directory name."
  echo "Usage: $0 my-app-name"
  exit 1
fi

touchp() {
    mkdir -p "$(dirname "$1")" && touch "$1"
}

catp() {
  [ $# -eq 1 ] || { echo "usage: catp <path>" >&2; return 2; }
  local path=$1
  mkdir -p -- "$(dirname -- "$path")"
  if [ -t 0 ]; then
    : >"$path"  # touch if missing
    cat -- "$path"
  else
    cat >"$path"
  fi
}

APP_NAME="$1"

# Basic sanity checks
command -v node >/dev/null 2>&1 || { echo "Node.js not found"; exit 1; }
command -v npm  >/dev/null 2>&1 || { echo "npm not found"; exit 1; }

echo "▶ Creating Next.js app: ${APP_NAME}"
npx create-next-app@latest "${APP_NAME}" --yes --use-npm

cd "${APP_NAME}"

echo "▶ Initializing shadcn/ui (non-interactive)"
npx --yes shadcn@latest init -y --template next --base-color neutral

echo "▶ Adding ALL shadcn/ui components"
npx --yes shadcn@latest add --all -y

echo "▶ Installing additional dependencies (Prisma, better-auth)"
npm i -D prisma
npm i @prisma/client better-auth

echo "▶ Prisma init (PostgreSQL)"
npx prisma init --datasource-provider postgresql
# delete the .env example shit out by prisma init
: > .env


# update schema.prisma contents
cat > prisma/schema.prisma <<'EOF'
generator client {
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
}
EOF

echo "▶ Creating a temporary Prisma Postgres database (expires ~24h)"
DB_URL="$(npx --yes create-db@latest \
  | grep -o 'postgresql://[^[:space:]]*' | head -n1 || true)"

if [[ -z "${DB_URL}" ]]; then
  echo "❌ Failed to obtain a database URL from create-db."
  exit 1
fi

# update schema.prisma contents
catp .env.local <<EOF
DATABASE_URL=${DB_URL}
BETTER_AUTH_URL=http://localhost:3000
BETTER_AUTH_SECRET=your_auth_secret
EOF

echo "▶ Pushing Prisma schema to remote database"
# this is the only thing causing an issue, maybe 
npx env-cmd -f .env.local prisma db push

# configure better-auth
catp ./src/lib/auth.ts <<'EOF'
import { betterAuth } from 'better-auth';
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
EOF

# yes | npx @better-auth/cli@latest generate 
# locally disable pipefail just for this line, prevents script exit
(set +o pipefail; yes | npx @better-auth/cli@latest generate)

# update generated page.tsx
catp src/app/page.tsx <<'EOF'
import { Button } from '@/components/ui/button';
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
      <p className="text-sm">{user && `Logged in as ${user.user.email}`}</p>
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
}
EOF

# create sign-in page
catp src/app/sign-in/page.tsx <<'EOF'
import { EmailAuthForm } from "@/components/auth/email-auth-form";

export default function SignInPage() {
  return <EmailAuthForm mode="sign-in" />;
}
EOF

# create sign-up page
catp src/app/sign-up/page.tsx <<'EOF'
import { EmailAuthForm } from "@/components/auth/email-auth-form";

export default function SignUpPage() {
  return <EmailAuthForm mode="sign-up" />;
}
EOF

# create the email auth form component
catp src/components/auth/email-auth-form.tsx <<'EOF'
"use client";

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
            {isSubmitting ? `${submitLabel}...` : submitLabel}
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
EOF

# create the auth client
catp src/lib/auth-client.ts <<'EOF'
import { createAuthClient } from "better-auth/react"

export const authClient = createAuthClient({
    /** The base URL of the server (optional if you're using the same domain) */
    baseURL: process.env.BETTER_AUTH_URL
})
EOF

# mk api route
catp src/app/api/auth/[...all]/route.ts <<'EOF'
import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";
 
export const { POST, GET } = toNextJsHandler(auth);
EOF


echo "▶ Committing changes to git"
git add .
git commit -m "Initial commit from mknext script"

echo "▶ Opening app in VSCode"
/usr/bin/open -a "Visual Studio Code" .