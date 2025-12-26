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

  // 3. Scheduled Posts
  db.prepare(`
    CREATE TABLE IF NOT EXISTS scheduled_posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_path TEXT,
      caption TEXT,
      publish_at DATETIME,
      status TEXT DEFAULT 'PENDING',
      linked_flow_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
  addColumnSafe('scheduled_posts', 'media_type', 'TEXT');

  // 4. Leads
  db.prepare(`
    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT,
      email TEXT,
      phone TEXT,
      source TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  // 5. Message Queue
  db.prepare(`
    CREATE TABLE IF NOT EXISTS message_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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

  // 6. Conversation State (Engine Dependency)
  db.prepare(`
    CREATE TABLE IF NOT EXISTS conversation_state (
      user_id TEXT PRIMARY KEY,
      state TEXT DEFAULT 'NONE', 
      last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  // 7. Logs (Dashboard Dependency)
  db.prepare(`
    CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      level TEXT DEFAULT 'INFO',
      message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  // 8. Performance Indexes
  // Message Queue: Critical for dashboard stats and polling
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_mq_status ON message_queue(status)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_mq_execute_at ON message_queue(execute_at)`).run();

  // Scheduled Posts: Critical for scheduler polling
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_sp_status ON scheduled_posts(status)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_sp_publish_at ON scheduled_posts(publish_at)`).run();

  // Automations: Critical for engine lookups
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_af_active ON automation_flows(is_active)`).run();

  console.log('✅ Database Schema & Migrations Applied.');
};