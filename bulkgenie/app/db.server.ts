import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql/web";

declare global {
  var prismaGlobal: PrismaClient;
}

function buildPrismaClient(): PrismaClient {
  const rawUrl = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (rawUrl && authToken) {
    // Convert libsql:// to https:// for the web/HTTP adapter
    const url = rawUrl.replace(/^libsql:\/\//, "https://");
    const adapter = new PrismaLibSQL({ url, authToken });
    return new PrismaClient({ adapter });
  }

  // Fallback to default (local SQLite for dev)
  return new PrismaClient();
}

if (process.env.NODE_ENV !== "production") {
  if (!global.prismaGlobal) {
    global.prismaGlobal = buildPrismaClient();
  }
}

const prisma = global.prismaGlobal ?? buildPrismaClient();

export default prisma;
