import { PrismaClient } from "@prisma/client";

declare global {
  var prismaGlobal: PrismaClient | undefined;
}

if (!global.prismaGlobal) {
  global.prismaGlobal = new PrismaClient();
}

export default global.prismaGlobal;
