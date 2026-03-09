import { Pool } from "pg";

declare global {
  var __assetPool: Pool | undefined;
}

function getConnectionString() {
  const connection = process.env.DATABASE_URL;
  if (!connection) {
    throw new Error("DATABASE_URL is not configured");
  }
  return connection;
}

export function getPool() {
  if (!global.__assetPool) {
    global.__assetPool = new Pool({
      connectionString: getConnectionString(),
      ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
    });
  }

  return global.__assetPool;
}

let initialized = false;

export async function ensureUsersTable() {
  if (initialized) {
    return;
  }

  const pool = getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(64) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  initialized = true;
}
