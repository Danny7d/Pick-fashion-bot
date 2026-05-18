const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Database file path
const dbPath = path.join(__dirname, 'support_bot.db');
const schemaPath = path.join(__dirname, 'schema.sql');

// Initialize database
let db;

function initDatabase() {
  // Create database if it doesn't exist
  const dbExists = fs.existsSync(dbPath);
  
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL'); // Better concurrent access
  
  // Run schema if database is new
  if (!dbExists) {
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    db.exec(schema);
    console.log('✅ Database initialized with schema');
  }
  
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
