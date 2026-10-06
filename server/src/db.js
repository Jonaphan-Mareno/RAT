import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'data', 'rat.db');

let db;

export function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.pragma('synchronous = NORMAL');
    db.pragma('cache_size = -64000'); // 64MB
    initSchema(db);
  }
  return db;
}

function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS repositories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      path TEXT NOT NULL,
      ref_commit TEXT,
      status TEXT DEFAULT 'pending',
      progress_pct REAL DEFAULT 0,
      commit_count INTEGER DEFAULT 0,
      error_message TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS commits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      repo_id INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
      hash TEXT NOT NULL,
      author_name TEXT NOT NULL,
      author_email TEXT NOT NULL,
      committer_date TEXT NOT NULL,
      UNIQUE(repo_id, hash)
    );

    CREATE TABLE IF NOT EXISTS file_changes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      commit_id INTEGER NOT NULL REFERENCES commits(id) ON DELETE CASCADE,
      file_path TEXT NOT NULL,
      added_lines INTEGER NOT NULL DEFAULT 0,
      removed_lines INTEGER NOT NULL DEFAULT 0,
      is_binary INTEGER NOT NULL DEFAULT 0,
      renamed_from TEXT
    );

    CREATE TABLE IF NOT EXISTS author_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      repo_id INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
      canonical_name TEXT NOT NULL,
      canonical_email TEXT NOT NULL,
      source TEXT DEFAULT 'manual'
    );

    CREATE TABLE IF NOT EXISTS author_aliases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL REFERENCES author_groups(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      UNIQUE(group_id, name, email)
    );

    CREATE INDEX IF NOT EXISTS idx_commits_repo_date ON commits(repo_id, committer_date);
    CREATE INDEX IF NOT EXISTS idx_commits_repo_hash ON commits(repo_id, hash);
    CREATE INDEX IF NOT EXISTS idx_commits_author ON commits(repo_id, author_name, author_email);
    CREATE INDEX IF NOT EXISTS idx_file_changes_commit ON file_changes(commit_id);
    CREATE INDEX IF NOT EXISTS idx_file_changes_path ON file_changes(file_path);
    CREATE INDEX IF NOT EXISTS idx_author_aliases_identity ON author_aliases(name, email);
    CREATE INDEX IF NOT EXISTS idx_author_groups_repo ON author_groups(repo_id);
  `);
}

export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}
