const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Database file path
const dbPath = path.join(__dirname, 'support_bot.db');
const schemaPath = path.join(__dirname, 'schema.sql');

// Initialize database
let db;

function initDatabase() {
  if (db) {
    return db;
  }

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL'); // Better concurrent access

  // Always apply the schema. Every statement in schema.sql is
  // CREATE ... IF NOT EXISTS, so this is safe to re-run on an existing
  // database and picks up new tables/indexes without a manual migration.
  const schema = fs.readFileSync(schemaPath, 'utf-8');
  db.exec(schema);

  return db;
}

function getDatabase() {
  if (!db) {
    initDatabase();
  }
  return db;
}

module.exports = {
  initDatabase,
  getDatabase
};
