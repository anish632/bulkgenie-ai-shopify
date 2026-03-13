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
    try {
      const libsql = createClient({
        url: tursoUrl,
        authToken: authToken,
      });
      const adapter = new PrismaLibSQL(libsql);
      console.log('[DB] Using Turso with libSQL adapter:', tursoUrl);
      return new PrismaClient({ 
        adapter,
        // Provide dummy datasource URL to prevent Prisma from using DATABASE_URL
        datasourceUrl: "file:./dev.sqlite"
      });
    } catch (error) {
      console.error('[DB] Failed to create Turso client:', error);
      throw error;
    }
  }

  // Fallback to local SQLite for development
  console.log('[DB] Using local SQLite database');
  return new PrismaClient();
}

// Singleton pattern for both dev and production
let prisma: PrismaClient;

if (process.env.NODE_ENV === "production") {
  prisma = buildPrismaClient();
} else {
  if (!global.prismaGlobal) {
    global.prismaGlobal = buildPrismaClient();
  }
  prisma = global.prismaGlobal;
}

export default prisma;
