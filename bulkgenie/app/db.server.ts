import { PrismaClient } from "@prisma/client";
import { createClient } from "@libsql/client/web";
import { PrismaLibSQL } from "@prisma/adapter-libsql";

declare global {
  var prismaGlobal: PrismaClient | undefined;
}

function buildPrismaClient(): PrismaClient {
  const tursoUrl = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  // Use Turso in production (when both env vars are set)
  if (tursoUrl && authToken) {
    const libsql = createClient({
      url: tursoUrl,
      authToken: authToken,
    });
    const adapter = new PrismaLibSQL(libsql);
    return new PrismaClient({ adapter });
  }

  // Fallback to local SQLite for development
  return new PrismaClient();
}

// Singleton pattern - reuse in development to avoid connection exhaustion
if (!global.prismaGlobal) {
  global.prismaGlobal = buildPrismaClient();
}

export default global.prismaGlobal;
