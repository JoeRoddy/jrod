#!/usr/bin/env bash
# mknext.sh
# Usage: ./mknext.sh my-app-name
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Error: provide a project directory name."
  echo "Usage: $0 my-app-name"
  exit 1
fi

APP_NAME="$1"

# Basic sanity checks
command -v node >/dev/null 2>&1 || { echo "Node.js not found"; exit 1; }
command -v npm  >/dev/null 2>&1 || { echo "npm not found"; exit 1; }

echo "▶ Creating Next.js app: ${APP_NAME}"
npx create-next-app@latest "${APP_NAME}" --yes --use-npm

cd "${APP_NAME}"

# update generated page.tsx
cat > src/app/page.tsx <<'EOF'
export default function Home() {
  return (
    <div className="h-screen w-full bg-red-50 flex items-center justify-center text-3xl text-center text-fuchsia-500">
      hello world
    </div>
  );
}
EOF

echo "▶ Initializing shadcn/ui (non-interactive)"
npx --yes shadcn@latest init -y --template next --base-color neutral

echo "▶ Adding ALL shadcn/ui components"
npx --yes shadcn@latest add --all -y

echo "▶ Installing Prisma and client"
npm i -D prisma
npm i @prisma/client

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

# Ensure .env.local exists
touch .env.local

echo "▶ Creating a temporary Prisma Postgres database (expires ~24h)"
DB_URL="$(npx --yes create-db@latest \
  | grep -o 'postgresql://[^[:space:]]*' | head -n1 || true)"

if [[ -z "${DB_URL}" ]]; then
  echo "❌ Failed to obtain a database URL from create-db."
  exit 1
fi

echo "$DB_URL"

# Write DATABASE_URL to .env.local only
if grep -qE "^DATABASE_URL=" ".env.local"; then
  sed -i.bak "s|^DATABASE_URL=.*|DATABASE_URL=${DB_URL}|" ".env.local" && rm -f ".env.local.bak"
else
  printf "\nDATABASE_URL=%s\n" "${DB_URL}" >> ".env.local"
fi

echo "▶ Pushing Prisma schema to remote databse"
npx env-cmd -f .env.local prisma db push

echo "▶ Committing changes to git"
git add .
git commit -m "Initial commit from mknext script"

echo "▶ Opening app in VSCode"
code .