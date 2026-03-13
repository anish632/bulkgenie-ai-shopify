import { PrismaClient } from "@prisma/client";
import { createClient } from "@libsql/client/web";
import { PrismaLibSQL } from "@prisma/adapter-libsql";

declare global {
  var prismaGlobal: PrismaClient | undefined;
}

function buildPrismaClient(): PrismaClient {
  const tursoUrl = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (tursoUrl && authToken) {
    // Use Turso with libSQL adapter
    const libsql = createClient({
      url: tursoUrl,
      authToken: authToken,
    });
    const adapter = new PrismaLibSQL(libsql);
    return new PrismaClient({ adapter });
  }

  // Fallback to default DATABASE_URL (local SQLite for dev)
  return new PrismaClient();
}

// Singleton pattern for both dev and production
if (!global.prismaGlobal) {
  global.prismaGlobal = buildPrismaClient();
}

const prisma = global.prismaGlobal;

export default prisma;
