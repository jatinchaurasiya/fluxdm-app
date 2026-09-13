import db from './db';

// Helper to safely add columns if they don't exist
const addColumnSafe = (table: string, column: string, type: string) => {
  try {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all() as any[];
    if (!columns.some(c => c.name === column)) {
      db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`).run();
    }
  } catch (error) {
    console.error(`Error adding column ${column} to ${table}:`, error);
  }
};

export const initDB = () => {
  // 1. User Configuration (Global Settings & Active Account Pointer)
  db.prepare(`
    CREATE TABLE IF NOT EXISTS user_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      meta_user_id TEXT,
      access_token TEXT,
      page_id TEXT,
      license_key TEXT,
      meta_app_id TEXT,
      meta_app_secret TEXT,
      verify_token TEXT,
      user_name TEXT,
      profile_picture_url TEXT,
      meta_access_token TEXT, -- Legacy support alias
      instagram_business_id TEXT, -- Legacy support alias
      active_account_id INTEGER -- Pointer to currently active account in accounts table
    )
  `).run();

  // Ensure legacy columns exist if table existed before
  addColumnSafe('user_config', 'meta_user_id', 'TEXT');
  addColumnSafe('user_config', 'access_token', 'TEXT');
  addColumnSafe('user_config', 'page_id', 'TEXT');
  addColumnSafe('user_config', 'license_key', 'TEXT');
  addColumnSafe('user_config', 'meta_app_id', 'TEXT');
  addColumnSafe('user_config', 'meta_app_secret', 'TEXT');
  addColumnSafe('user_config', 'verify_token', 'TEXT');
  addColumnSafe('user_config', 'user_name', 'TEXT');
  addColumnSafe('user_config', 'profile_picture_url', 'TEXT');
  addColumnSafe('user_config', 'settings', 'TEXT'); // stores JSON of general prefs, safety settings, etc.
  addColumnSafe('user_config', 'active_account_id', 'INTEGER');

  // Licensing & Multi-Device Anti-Exploitation Columns
  addColumnSafe('user_config', 'is_licensed', 'BOOLEAN DEFAULT 0');
  addColumnSafe('user_config', 'license_session_id', 'TEXT');
  addColumnSafe('user_config', 'license_signature', 'TEXT');
  addColumnSafe('user_config', 'license_email', 'TEXT');
  addColumnSafe('user_config', 'licensed_at', 'DATETIME');
  addColumnSafe('user_config', 'device_hardware_id', 'TEXT');
  addColumnSafe('user_config', 'paired_device_id', 'TEXT');
  addColumnSafe('user_config', 'node_role', "TEXT DEFAULT 'master_laptop'");
  addColumnSafe('user_config', 'last_heartbeat', 'DATETIME');

  // 1.5 Accounts Table (Multi-Account Support)
  db.prepare(`
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      meta_user_id TEXT,
      instagram_business_id TEXT UNIQUE, -- Unique to prevent duplicates
      page_id TEXT,
      access_token TEXT,
      username TEXT,
      profile_picture_url TEXT,
      is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  // 1.8 Device Seats Table (Strict 2-Seat Policy: 1 Computer + 1 Mobile Device)
  db.prepare(`
    CREATE TABLE IF NOT EXISTS device_seats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_hardware_id TEXT UNIQUE,
      device_name TEXT,
      device_type TEXT, -- 'desktop' | 'mobile'
      is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_seen DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  // MIGRATION: If user_config has data but accounts is empty, migrate it.
  try {
    const existingConfig = db.prepare('SELECT * FROM user_config LIMIT 1').get() as any;
    const existingAccounts = db.prepare('SELECT COUNT(*) as count FROM accounts').get() as any;

    if (existingConfig && existingConfig.meta_access_token && existingConfig.instagram_business_id && existingAccounts.count === 0) {
      console.log('🔄 Migrating single-user config to accounts table...');
      const info = db.prepare(`
        INSERT INTO accounts (meta_user_id, instagram_business_id, page_id, access_token, username, profile_picture_url)
        VALUES (@meta_user_id, @instagram_business_id, @page_id, @access_token, @username, @profile_picture_url)
      `).run({
        meta_user_id: existingConfig.meta_user_id || null,
        instagram_business_id: existingConfig.instagram_business_id,
        page_id: existingConfig.page_id,
        access_token: existingConfig.meta_access_token, // Using the alias
        username: existingConfig.user_name,
        profile_picture_url: existingConfig.profile_picture_url
      });

      // Set the active account
      db.prepare('UPDATE user_config SET active_account_id = ? WHERE id = ?').run(info.lastInsertRowid, existingConfig.id);
      console.log('✅ Migration complete.');
    }
  } catch (err) {
    console.warn('⚠️ Migration warning:', err);
  }

  // 2. Automation Flows
  db.prepare(`
    CREATE TABLE IF NOT EXISTS automation_flows (
      id TEXT PRIMARY KEY,
      account_id INTEGER,
      name TEXT,
      is_active INTEGER DEFAULT 1,
      trigger_type TEXT DEFAULT 'KEYWORD',
      trigger_keyword TEXT,
      attached_media_id TEXT,
      nodes_json TEXT,
      edges_json TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
  addColumnSafe('automation_flows', 'trigger_type', 'TEXT');
  addColumnSafe('automation_flows', 'account_id', 'INTEGER');

  // 3. Scheduled Posts
  db.prepare(`
    CREATE TABLE IF NOT EXISTS scheduled_posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER,
      file_path TEXT,
      caption TEXT,
      publish_at DATETIME,
      status TEXT DEFAULT 'PENDING',
      linked_flow_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
  addColumnSafe('scheduled_posts', 'media_type', 'TEXT');
  addColumnSafe('scheduled_posts', 'account_id', 'INTEGER');
  addColumnSafe('scheduled_posts', 'error_message', 'TEXT');

  // 4. Leads
  db.prepare(`
    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER,
      username TEXT,
      email TEXT,
      phone TEXT,
      source TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
  addColumnSafe('leads', 'account_id', 'INTEGER');

  // 5. Message Queue
  db.prepare(`
    CREATE TABLE IF NOT EXISTS message_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER,
      recipient_id TEXT,
      status TEXT DEFAULT 'PENDING',
      payload_json TEXT,
      execute_at DATETIME,
      message_text TEXT,
      message_type TEXT,
      try_count INTEGER DEFAULT 0,
      comment_id TEXT,
      source TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
  addColumnSafe('message_queue', 'payload_json', 'TEXT');
  addColumnSafe('message_queue', 'execute_at', 'DATETIME');
  addColumnSafe('message_queue', 'account_id', 'INTEGER');

  // 6. Conversation State (Engine Dependency)
  db.prepare(`
    CREATE TABLE IF NOT EXISTS conversation_state (
      user_id TEXT PRIMARY KEY,
      account_id INTEGER,
      state TEXT DEFAULT 'NONE', 
      current_flow_id TEXT,
      step TEXT,
      context_json TEXT,
      last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
  addColumnSafe('conversation_state', 'account_id', 'INTEGER');
  addColumnSafe('conversation_state', 'current_flow_id', 'TEXT');
  addColumnSafe('conversation_state', 'step', 'TEXT');
  addColumnSafe('conversation_state', 'context_json', 'TEXT');

  // 7. Logs (Dashboard Dependency)
  db.prepare(`
    CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER,
      level TEXT DEFAULT 'INFO',
      message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
  addColumnSafe('logs', 'account_id', 'INTEGER');

  // 8. Performance Indexes
  // Message Queue: Critical for dashboard stats and polling
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_mq_status ON message_queue(status)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_mq_execute_at ON message_queue(execute_at)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_mq_account ON message_queue(account_id)`).run();

  // Scheduled Posts: Critical for scheduler polling
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_sp_status ON scheduled_posts(status)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_sp_publish_at ON scheduled_posts(publish_at)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_sp_account ON scheduled_posts(account_id)`).run();

  // Automations: Critical for engine lookups
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_af_active ON automation_flows(is_active)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_af_account ON automation_flows(account_id)`).run();

  // Performance Indexes (Scaling)
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_logs_created_at ON logs(created_at)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_leads_account ON leads(account_id)`).run();

  console.log('✅ Database Schema & Migrations Applied.');
};