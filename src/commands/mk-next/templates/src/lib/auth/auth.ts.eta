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
