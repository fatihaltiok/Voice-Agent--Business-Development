import path from "path";
import fs from "fs";

// Typ-Import nur für TypeScript-Prüfung
import type Database from "better-sqlite3";

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (db) return db;

  // Datenverzeichnis sicherstellen
  const dataDir = path.join(process.cwd(), "data");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const dbPath = path.join(dataDir, "voice-agent.db");

  // Dynamischer Import des nativen Moduls
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const BetterSQLite3 = require("better-sqlite3");
  db = new BetterSQLite3(dbPath) as Database.Database;

  (db as Database.Database).pragma("journal_mode = WAL");
  initSchema(db as Database.Database);

  return db as Database.Database;
}

function initSchema(database: Database.Database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS calls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vapi_call_id TEXT UNIQUE,
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      ended_at DATETIME,
      duration_seconds INTEGER DEFAULT 0,
      transcript TEXT,
      summary TEXT,
      lead_score TEXT DEFAULT 'C',
      appointment_booked INTEGER DEFAULT 0,
      appointment_time TEXT,
      appointment_url TEXT,
      drop_off_stage TEXT DEFAULT 'greeting',
      lead_name TEXT,
      lead_email TEXT
    );

    CREATE TABLE IF NOT EXISTS lead_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      call_id INTEGER REFERENCES calls(id) ON DELETE CASCADE,
      company_size TEXT,
      budget TEXT,
      is_decision_maker INTEGER DEFAULT 0,
      timeline TEXT,
      pain_point TEXT,
      current_tools TEXT
    );
  `);
}

export { getDb };
