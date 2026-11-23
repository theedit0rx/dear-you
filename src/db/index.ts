import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;

// Production API traffic is proxied to the Cloudflare Worker by next.config.ts.
// Keep the legacy PostgreSQL adapter buildable for Vercel route analysis;
// local PostgreSQL development still requires DATABASE_URL.
if (!databaseUrl && process.env.NODE_ENV !== "production") {
  throw new Error("DATABASE_URL is required for the local PostgreSQL adapter");
}

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};

export const pool =
  globalForDb.__arenaNextJsPostgresqlPool ??
  new Pool({
    ...(databaseUrl ? { connectionString: databaseUrl } : {}),
    connectionTimeoutMillis: 1500,
    max: 2,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__arenaNextJsPostgresqlPool = pool;
}

export const db = drizzle(pool);
