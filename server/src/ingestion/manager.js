import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import AdmZip from 'adm-zip';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db.js';
import {
  cloneRepo,
  getRefHash,
  isGitRepo,
  countNonMergeCommits,
  parseGitLog,
  getMailmap,
  parseMailmap,
} from '../git.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPOS_DIR = path.join(__dirname, '..', '..', 'data', 'repos');

// Ensure repos directory exists
if (!fs.existsSync(REPOS_DIR)) {
  fs.mkdirSync(REPOS_DIR, { recursive: true });
}

// SSE clients tracking per repo
const sseClients = new Map(); // repoId -> Set of response objects

export function addSSEClient(repoId, res) {
  if (!sseClients.has(repoId)) sseClients.set(repoId, new Set());
  sseClients.get(repoId).add(res);
  res.on('close', () => {
    sseClients.get(repoId)?.delete(res);
  });
}

function notifyProgress(repoId, data) {
  const clients = sseClients.get(repoId);
  if (clients) {
    for (const res of clients) {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    }
  }
}

/**
 * Ingest a repo from a clone URL.
 */
export async function ingestFromUrl(url, repoName, ref = 'HEAD') {
  const db = getDb();
  const repoDir = path.join(REPOS_DIR, uuidv4());

  // Create repo record
  const stmt = db.prepare(
    'INSERT INTO repositories (name, path, status) VALUES (?, ?, ?)'
  );
  const result = stmt.run(repoName || url.split('/').pop()?.replace('.git', '') || 'repo', repoDir, 'ingesting');
  const repoId = result.lastInsertRowid;

  // Start async ingestion
  processIngestion(repoId, repoDir, async () => {
    notifyProgress(repoId, { status: 'cloning', pct: 0 });
    await cloneRepo(url, repoDir, (pct) => {
      notifyProgress(repoId, { status: 'cloning', pct: Math.floor(pct * 0.3) });
    });
  }, ref);

  return repoId;
}

/**
 * Ingest a repo from an uploaded zip file.
 */
export async function ingestFromZip(zipPath, repoName, ref = 'HEAD') {
  const db = getDb();
  const repoDir = path.join(REPOS_DIR, uuidv4());

  // Create repo record
  const stmt = db.prepare(
    'INSERT INTO repositories (name, path, status) VALUES (?, ?, ?)'
  );
  const result = stmt.run(repoName || 'uploaded-repo', repoDir, 'ingesting');
  const repoId = result.lastInsertRowid;

  // Start async ingestion
  processIngestion(repoId, repoDir, async () => {
    notifyProgress(repoId, { status: 'extracting', pct: 0 });
    await extractZip(zipPath, repoDir);
    notifyProgress(repoId, { status: 'extracting', pct: 30 });
  }, ref);

  return repoId;
}

async function extractZip(zipPath, destDir) {
  const zip = new AdmZip(zipPath);
  const entries = zip.getEntries();

  // Zip-slip protection & find root
  let gitFound = false;
  let rootPrefix = '';

  for (const entry of entries) {
    const entryPath = entry.entryName;
    // Zip-slip check
    if (entryPath.includes('..') || path.isAbsolute(entryPath)) {
      throw new Error('Zip contains unsafe path: ' + entryPath);
    }
    // Check for .git
    const parts = entryPath.split('/');
    if (parts.includes('.git') || parts.some(p => p === '.git')) {
      gitFound = true;
      // Determine root prefix (e.g., "repo-name/.git" -> root is "repo-name/")
      const gitIdx = parts.indexOf('.git');
      if (gitIdx > 0) {
        rootPrefix = parts.slice(0, gitIdx).join('/') + '/';
      }
    }
  }

  if (!gitFound) {
    throw new Error('Zip does not contain a .git directory. GitHub Download ZIP archives omit commit history; use Clone URL or upload an archive that includes .git.');
  }

  // Extract
  fs.mkdirSync(destDir, { recursive: true });

  for (const entry of entries) {
    let entryPath = entry.entryName;
    // Strip root prefix if present
    if (rootPrefix && entryPath.startsWith(rootPrefix)) {
      entryPath = entryPath.slice(rootPrefix.length);
    }
    if (!entryPath) continue;

    const fullPath = path.join(destDir, entryPath);

    // Extra zip-slip check on resolved path
    if (!fullPath.startsWith(destDir)) {
      throw new Error('Zip-slip detected for: ' + entryPath);
    }

    if (entry.isDirectory) {
      fs.mkdirSync(fullPath, { recursive: true });
    } else {
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, entry.getData());
    }
  }

  // Verify it's a valid git repo
  if (!isGitRepo(destDir)) {
    throw new Error('Extracted content is not a valid git repository.');
  }

  // Clean up zip file
  try { fs.unlinkSync(zipPath); } catch {}
}

async function processIngestion(repoId, repoDir, prepareStep, requestedRef = 'HEAD') {
  const db = getDb();
  try {
    await prepareStep();

    if (!isGitRepo(repoDir)) {
      throw new Error('Not a valid git repository after preparation.');
    }

    const refHash = getRefHash(repoDir, requestedRef || 'HEAD');
    const totalCommits = countNonMergeCommits(repoDir, refHash);

    db.prepare('UPDATE repositories SET ref_commit = ?, commit_count = ? WHERE id = ?')
      .run(refHash, totalCommits, repoId);

    notifyProgress(repoId, { status: 'parsing', pct: 30, totalCommits });

    // Parse git log and insert commits + file changes
    const insertCommit = db.prepare(
      'INSERT INTO commits (repo_id, hash, author_name, author_email, committer_date) VALUES (?, ?, ?, ?, ?)'
    );
    const insertFileChange = db.prepare(
      'INSERT INTO file_changes (commit_id, file_path, added_lines, removed_lines, is_binary, renamed_from) VALUES (?, ?, ?, ?, ?, ?)'
    );

    let processed = 0;
    const BATCH_SIZE = 500;
    let batch = [];

    const flushBatch = () => {
      if (batch.length === 0) return;
      const transaction = db.transaction(() => {
        for (const commit of batch) {
          const res = insertCommit.run(
            repoId, commit.hash, commit.authorName, commit.authorEmail, commit.committerDate
          );
          const commitId = res.lastInsertRowid;
          for (const file of commit.files) {
            insertFileChange.run(
              commitId, file.path, file.added, file.removed, file.isBinary ? 1 : 0, file.renamedFrom || null
            );
          }
        }
      });
      transaction();
      batch = [];
    };

    await parseGitLog(repoDir, refHash, (commit) => {
      batch.push(commit);
      processed++;
      if (batch.length >= BATCH_SIZE) {
        flushBatch();
      }
      if (processed % 200 === 0) {
        const pct = 30 + Math.floor((processed / totalCommits) * 65);
        db.prepare('UPDATE repositories SET progress_pct = ? WHERE id = ?').run(pct, repoId);
        notifyProgress(repoId, { status: 'parsing', pct, processed, totalCommits });
      }
    });

    // Flush remaining
    flushBatch();

    // Process mailmap
    const mailmapContent = getMailmap(repoDir, refHash);
    if (mailmapContent) {
      applyMailmap(repoId, mailmapContent);
    }

    // Mark as ready
    db.prepare('UPDATE repositories SET status = ?, progress_pct = 100, commit_count = ? WHERE id = ?')
      .run('ready', processed, repoId);
    notifyProgress(repoId, { status: 'ready', pct: 100, processed });

  } catch (error) {
    console.error(`Ingestion failed for repo ${repoId}:`, error);
    db.prepare('UPDATE repositories SET status = ?, error_message = ? WHERE id = ?')
      .run('error', error.message, repoId);
    notifyProgress(repoId, { status: 'error', error: error.message });
  }
}

function applyMailmap(repoId, mailmapContent) {
  const db = getDb();
  const mappings = parseMailmap(mailmapContent);

  // Get all unique authors for this repo
  const authors = db.prepare(
    'SELECT DISTINCT author_name, author_email FROM commits WHERE repo_id = ?'
  ).all(repoId);

  // Build groups from mailmap
  const groupMap = new Map(); // canonicalKey -> { canonical, aliases }

  for (const mapping of mappings) {
    const canonicalKey = `${mapping.canonicalName || ''}|${mapping.canonicalEmail}`;
    if (!groupMap.has(canonicalKey)) {
      groupMap.set(canonicalKey, {
        canonicalName: mapping.canonicalName,
        canonicalEmail: mapping.canonicalEmail,
        aliases: new Set(),
      });
    }
    const group = groupMap.get(canonicalKey);
    // Find authors that match alias
    for (const author of authors) {
      const emailMatch = mapping.aliasEmail && author.author_email === mapping.aliasEmail;
      const nameMatch = mapping.aliasName && author.author_name === mapping.aliasName;
      if (emailMatch && (!mapping.aliasName || nameMatch)) {
        group.aliases.add(`${author.author_name}|${author.author_email}`);
      }
    }
    // Also add the canonical identity itself
    for (const author of authors) {
      if (author.author_email === mapping.canonicalEmail) {
        group.aliases.add(`${author.author_name}|${author.author_email}`);
        if (!group.canonicalName) group.canonicalName = author.author_name;
      }
    }
  }

  // Insert groups that have actual aliases
  const insertGroup = db.prepare(
    'INSERT INTO author_groups (repo_id, canonical_name, canonical_email, source) VALUES (?, ?, ?, ?)'
  );
  const insertAlias = db.prepare(
    'INSERT OR IGNORE INTO author_aliases (group_id, name, email) VALUES (?, ?, ?)'
  );

  const transaction = db.transaction(() => {
    for (const [, group] of groupMap) {
      if (group.aliases.size <= 1) continue; // No merging needed for single identity
      const res = insertGroup.run(
        repoId,
        group.canonicalName || 'Unknown',
        group.canonicalEmail,
        'mailmap'
      );
      const groupId = res.lastInsertRowid;
      for (const alias of group.aliases) {
        const [name, email] = alias.split('|');
        insertAlias.run(groupId, name, email);
      }
    }
  });
  transaction();
}

export function deleteRepo(repoId) {
  const db = getDb();
  const repo = db.prepare('SELECT path FROM repositories WHERE id = ?').get(repoId);
  if (repo && repo.path && fs.existsSync(repo.path)) {
    fs.rmSync(repo.path, { recursive: true, force: true });
  }
  db.prepare('DELETE FROM repositories WHERE id = ?').run(repoId);
}
