// electron/database/db.ts
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
import path from 'path';
import electron from 'electron';
const { app } = electron;

// This saves the file in the user's AppData folder (safe from deletion)
const dbPath = path.join(app.getPath('userData'), 'fluxdm.sqlite');

const db = new Database(dbPath);
db.pragma('journal_mode = WAL'); // Faster performance

export default db;