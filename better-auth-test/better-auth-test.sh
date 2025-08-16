#!/usr/bin/env bash
echo "REMOVE DB URL!!!!"
DB_URL="postgresql://e4cfdcb2d3fcbee88db320a5479b31c54b09e215f27f6a2ac6829f9ccc82295e:sk_1VUCdt39AeSn1yjyKo7Oz@db.prisma.io:5432/postgres"

cat > .env.local <<EOF
DATABASE_URL=${DB_URL}
BETTER_AUTH_URL=http://localhost:3000 
BETTER_AUTH_SECRET=some_secret
EOF

touch ./src/lib/auth.ts
cat > ./src/lib/auth.ts <<EOF
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { PrismaClient } from '@/generated/prisma';

const prisma = new PrismaClient();

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  emailAndPassword: { 
    enabled: true, 
  }, 
});
EOF

yes | npx @better-auth/cli@latest generate 

touch ./src/app/api/auth/[...all]/route.ts
cat > ./src/app/api/auth/[...all]/route.ts <<EOF
import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";
 
export const { POST, GET } = toNextJsHandler(auth);
EOF

touch ./src/lib/auth-client.ts
cat > ./src/lib/auth-client.ts <<EOF
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
    /** The base URL of the server (optional if you're using the same domain) */
    baseURL: process.env.BETTER_AUTH_URL
})
EOF