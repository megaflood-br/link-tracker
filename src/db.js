import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export function initDb(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  const db = new DatabaseSync(filePath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS clicks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      link_id INTEGER NOT NULL,
      clicked_at TEXT NOT NULL,
      ip TEXT,
      user_agent TEXT,
      referrer TEXT,
      device TEXT,
      FOREIGN KEY (link_id) REFERENCES links(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_clicks_link ON clicks(link_id);
    CREATE INDEX IF NOT EXISTS idx_clicks_at ON clicks(clicked_at);
  `);

  return db;
}
