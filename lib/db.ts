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

let usersTableInitialized = false;
let assetHoldingsTableInitialized = false;
let assetEntriesTableInitialized = false;
let userProfilesTableInitialized = false;
let integrationConnectionsTableInitialized = false;
let backgroundJobsTableInitialized = false;
let webhookEventsTableInitialized = false;

export async function ensureUsersTable() {
  if (usersTableInitialized) {
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

  usersTableInitialized = true;
}

export async function ensureAssetHoldingsTable() {
  if (assetHoldingsTableInitialized) {
    return;
  }

  await ensureUsersTable();

  const pool = getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS asset_holdings (
      id SERIAL PRIMARY KEY,
      username VARCHAR(64) NOT NULL REFERENCES users(username) ON DELETE CASCADE,
      category_key VARCHAR(32) NOT NULL,
      amount NUMERIC(15, 2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(username, category_key)
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS asset_holdings_username_idx
    ON asset_holdings (username);
  `);

  assetHoldingsTableInitialized = true;
}

export async function ensureAssetEntriesTable() {
  if (assetEntriesTableInitialized) {
    return;
  }

  await ensureUsersTable();

  const pool = getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS asset_entries (
      id SERIAL PRIMARY KEY,
      username VARCHAR(64) NOT NULL REFERENCES users(username) ON DELETE CASCADE,
      category_key VARCHAR(32) NOT NULL,
      subtype_key VARCHAR(32),
      label VARCHAR(120) NOT NULL,
      amount_manwon INTEGER NOT NULL DEFAULT 0 CHECK (amount_manwon >= 0),
      extra_data JSONB NOT NULL DEFAULT '{}'::jsonb,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);
  await pool.query(`
    ALTER TABLE asset_entries
    ADD COLUMN IF NOT EXISTS extra_data JSONB NOT NULL DEFAULT '{}'::jsonb;
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS asset_entries_username_idx
    ON asset_entries (username, category_key, sort_order);
  `);

  assetEntriesTableInitialized = true;
}

export async function ensureUserProfilesTable() {
  if (userProfilesTableInitialized) {
    return;
  }

  await ensureUsersTable();

  const pool = getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_profiles (
      username VARCHAR(64) PRIMARY KEY REFERENCES users(username) ON DELETE CASCADE,
      display_name VARCHAR(80),
      timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Seoul',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);

  userProfilesTableInitialized = true;
}

export async function ensureIntegrationConnectionsTable() {
  if (integrationConnectionsTableInitialized) {
    return;
  }

  await ensureUsersTable();

  const pool = getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS integration_connections (
      id SERIAL PRIMARY KEY,
      username VARCHAR(64) NOT NULL REFERENCES users(username) ON DELETE CASCADE,
      provider VARCHAR(50) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'disconnected',
      config JSONB NOT NULL DEFAULT '{}'::jsonb,
      connected_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(username, provider)
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS integration_connections_username_idx
    ON integration_connections (username, provider);
  `);

  integrationConnectionsTableInitialized = true;
}

export async function ensureBackgroundJobsTable() {
  if (backgroundJobsTableInitialized) {
    return;
  }

  await ensureUsersTable();

  const pool = getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS background_jobs (
      id VARCHAR(36) PRIMARY KEY,
      username VARCHAR(64) NOT NULL REFERENCES users(username) ON DELETE CASCADE,
      job_type VARCHAR(80) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'queued',
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      result JSONB,
      error_message TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS background_jobs_username_idx
    ON background_jobs (username, created_at DESC);
  `);

  backgroundJobsTableInitialized = true;
}

export async function ensureWebhookEventsTable() {
  if (webhookEventsTableInitialized) {
    return;
  }

  const pool = getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS webhook_events (
      id SERIAL PRIMARY KEY,
      provider VARCHAR(50) NOT NULL,
      delivery_id VARCHAR(120),
      event_type VARCHAR(120),
      signature_valid BOOLEAN NOT NULL DEFAULT false,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      received_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(provider, delivery_id)
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS webhook_events_provider_received_idx
    ON webhook_events (provider, received_at DESC);
  `);

  webhookEventsTableInitialized = true;
}
