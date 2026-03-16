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
let assetSnapshotsTableInitialized = false;
let userProfilesTableInitialized = false;
let scheduleTablesInitialized = false;
let integrationConnectionsTableInitialized = false;
let backgroundJobsTableInitialized = false;
let webhookEventsTableInitialized = false;
let issuesTableInitialized = false;
let habitTablesInitialized = false;

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

export async function ensureAssetSnapshotsTable() {
  if (assetSnapshotsTableInitialized) return;
  await ensureUsersTable();
  const pool = getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS asset_snapshots (
      id SERIAL PRIMARY KEY,
      username VARCHAR(64) NOT NULL REFERENCES users(username) ON DELETE CASCADE,
      snapshot_date DATE NOT NULL,
      total_assets_manwon INTEGER NOT NULL DEFAULT 0,
      total_loans_manwon INTEGER NOT NULL DEFAULT 0,
      net_assets_manwon INTEGER NOT NULL DEFAULT 0,
      category_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(username, snapshot_date)
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS asset_snapshots_username_date_idx
    ON asset_snapshots (username, snapshot_date DESC);
  `);
  assetSnapshotsTableInitialized = true;
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

export async function ensureIssuesTable() {
  if (issuesTableInitialized) {
    return;
  }

  const pool = getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS realtime_issues (
      id SERIAL PRIMARY KEY,
      rank INTEGER NOT NULL,
      keyword TEXT NOT NULL,
      source_ranks JSONB NOT NULL DEFAULT '{}',
      score FLOAT NOT NULL DEFAULT 0,
      gender_weights JSONB NOT NULL DEFAULT '{"male":0.5,"female":0.5}',
      age_weights JSONB NOT NULL DEFAULT '{"10":0.2,"20":0.2,"30":0.2,"40":0.2,"50":0.1,"60":0.1}',
      meta JSONB DEFAULT '{}',
      collected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_ri_collected_at
    ON realtime_issues (collected_at DESC);
  `);

  issuesTableInitialized = true;
}

export async function ensureScheduleTables() {
  if (scheduleTablesInitialized) return;

  await ensureUsersTable();
  const pool = getPool();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS schedule_events (
      id SERIAL PRIMARY KEY,
      username VARCHAR(64) NOT NULL REFERENCES users(username) ON DELETE CASCADE,
      event_date DATE NOT NULL,
      start_time SMALLINT NOT NULL,
      end_time SMALLINT NOT NULL,
      title VARCHAR(200) NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      color VARCHAR(20) NOT NULL DEFAULT '#0a84ff',
      repeat_type VARCHAR(10) NOT NULL DEFAULT 'none',
      repeat_group_id UUID,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      CHECK (start_time >= 420 AND start_time < 1440),
      CHECK (end_time > 420 AND end_time <= 1440),
      CHECK (end_time > start_time)
    );
  `);
  // 기존 테이블에 컬럼 추가 (idempotent)
  await pool.query(`ALTER TABLE schedule_events ADD COLUMN IF NOT EXISTS repeat_type VARCHAR(10) NOT NULL DEFAULT 'none';`);
  await pool.query(`ALTER TABLE schedule_events ADD COLUMN IF NOT EXISTS repeat_group_id UUID;`);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS schedule_events_user_date_idx
    ON schedule_events (username, event_date);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS schedule_events_group_idx
    ON schedule_events (repeat_group_id) WHERE repeat_group_id IS NOT NULL;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS schedule_day_summaries (
      username VARCHAR(64) NOT NULL REFERENCES users(username) ON DELETE CASCADE,
      summary_date DATE NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMP DEFAULT NOW(),
      PRIMARY KEY (username, summary_date)
    );
  `);

  // ── 성과 체크 (이벤트별 날짜별 성공 여부) ──
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schedule_event_completions (
      id SERIAL PRIMARY KEY,
      username VARCHAR(64) NOT NULL REFERENCES users(username) ON DELETE CASCADE,
      event_id INTEGER NOT NULL REFERENCES schedule_events(id) ON DELETE CASCADE,
      completion_date DATE NOT NULL,
      completed BOOLEAN NOT NULL DEFAULT FALSE,
      UNIQUE(username, event_id, completion_date)
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS sec_user_date_idx
    ON schedule_event_completions (username, completion_date);
  `);

  // ── 미션 템플릿 (공통 등록) ──
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schedule_mission_templates (
      id SERIAL PRIMARY KEY,
      username VARCHAR(64) NOT NULL REFERENCES users(username) ON DELETE CASCADE,
      title VARCHAR(200) NOT NULL DEFAULT '',
      reward_min SMALLINT NOT NULL DEFAULT 0,
      sort_order SMALLINT NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS smt_user_idx
    ON schedule_mission_templates (username);
  `);

  // ── 미션 완료 기록 (날짜별) ──
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schedule_mission_completions (
      id SERIAL PRIMARY KEY,
      username VARCHAR(64) NOT NULL REFERENCES users(username) ON DELETE CASCADE,
      template_id INTEGER NOT NULL REFERENCES schedule_mission_templates(id) ON DELETE CASCADE,
      mission_date DATE NOT NULL,
      completed BOOLEAN NOT NULL DEFAULT FALSE,
      quantity INTEGER NOT NULL DEFAULT 1,
      UNIQUE(username, template_id, mission_date)
    );
  `);
  // 기존 테이블에 quantity 컬럼 추가 (없는 경우)
  await pool.query(`
    ALTER TABLE schedule_mission_completions
    ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1;
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS smc_user_date_idx
    ON schedule_mission_completions (username, mission_date);
  `);

  scheduleTablesInitialized = true;
}

export async function ensureHabitTables() {
  if (habitTablesInitialized) return;

  await ensureUsersTable();
  const pool = getPool();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS habits (
      id SERIAL PRIMARY KEY,
      username VARCHAR(64) NOT NULL REFERENCES users(username) ON DELETE CASCADE,
      name VARCHAR(100) NOT NULL,
      icon VARCHAR(10) NOT NULL DEFAULT '✅',
      color VARCHAR(20) NOT NULL DEFAULT '#30d158',
      sort_order SMALLINT NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS habits_username_idx ON habits (username, sort_order);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS habit_logs (
      id SERIAL PRIMARY KEY,
      username VARCHAR(64) NOT NULL REFERENCES users(username) ON DELETE CASCADE,
      habit_id INTEGER NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
      log_date DATE NOT NULL,
      UNIQUE(username, habit_id, log_date)
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS hl_user_date_idx ON habit_logs (username, log_date);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS pomodoro_sessions (
      id SERIAL PRIMARY KEY,
      username VARCHAR(64) NOT NULL REFERENCES users(username) ON DELETE CASCADE,
      session_date DATE NOT NULL,
      work_minutes SMALLINT NOT NULL DEFAULT 25,
      completed BOOLEAN NOT NULL DEFAULT FALSE,
      label VARCHAR(80) NOT NULL DEFAULT '',
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS pomo_user_date_idx ON pomodoro_sessions (username, session_date DESC);
  `);

  habitTablesInitialized = true;
}
