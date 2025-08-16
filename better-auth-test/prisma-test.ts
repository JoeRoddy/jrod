import { PrismaClient } from '@/generated/prisma';

const prisma = new PrismaClient();

(async () => {
  const users = await prisma.user.findMany();
  console.log(users);
})();
