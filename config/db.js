const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const isServerless = Boolean(process.env.VERCEL || process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME);

function resolveDataDir() {
  if (process.env.DATA_DIR) return path.resolve(process.env.DATA_DIR);
  if (isServerless) return '/tmp/data';
  
  const parentData = path.join(__dirname, '../../data');
  const localData = path.join(__dirname, '../data');
  
  if (fs.existsSync(parentData)) return parentData;
  return localData;
}

const defaultDataDir = resolveDataDir();

const dbPath = process.env.DB_PATH 
  ? path.resolve(process.env.DB_PATH) 
  : path.join(defaultDataDir, 'smart_utility.db');

const targetDir = path.dirname(dbPath);
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

const db = new Database(dbPath, {
  // verbose: process.env.NODE_ENV === 'development' ? console.log : null
});

// Performance and Integrity pragmas
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('synchronous = NORMAL');

const SCHEMA_SQL = require('../database/schemaSql');

// Initialize schema if needed
function initSchema() {
  try {
    const schemaPath = path.join(__dirname, '../database/schema.sql');
    let schemaSql = SCHEMA_SQL;
    if (fs.existsSync(schemaPath)) {
      try {
        schemaSql = fs.readFileSync(schemaPath, 'utf8');
      } catch (e) {
        schemaSql = SCHEMA_SQL;
      }
    }
    db.exec(schemaSql);
  } catch (schemaErr) {
    console.warn('⚠️ [DB] Schema execution warning:', schemaErr.message);
  }

  // Auto-seed if database is empty
  try {
    const countRow = db.prepare('SELECT COUNT(*) as count FROM users').get();
    if (!countRow || countRow.count === 0) {
      const seedDatabase = require('../database/seed');
      seedDatabase();
    }
  } catch (err) {
    // Ignore if table doesn't exist yet
  }
}

initSchema();

module.exports = {
  db,
  query: (sql, params = []) => {
    return db.prepare(sql).all(params);
  },
  get: (sql, params = []) => {
    return db.prepare(sql).get(params);
  },
  run: (sql, params = []) => {
    return db.prepare(sql).run(params);
  },
  transaction: (fn) => {
    return db.transaction(fn);
  }
};
