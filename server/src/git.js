import { spawn, execSync } from 'child_process';
import path from 'path';

/**
 * Deep-clone a repo (full history, no shallow).
 * Returns a promise that resolves when clone is complete.
 * onProgress(pct) called with 0-100 estimates.
 */
export function cloneRepo(url, destPath, onProgress) {
  return new Promise((resolve, reject) => {
    const proc = spawn('git', ['clone', '--progress', url, destPath], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderr = '';
    proc.stderr.on('data', (data) => {
      const text = data.toString();
      stderr += text;
      // Parse progress from git clone output
      const match = text.match(/(\d+)%/);
      if (match && onProgress) {
        onProgress(parseInt(match[1], 10));
      }
    });

    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`git clone failed (code ${code}): ${stderr.slice(-500)}`));
    });

    proc.on('error', (err) => reject(err));
  });
}

/**
 * Get HEAD commit hash for a repo.
 */
export function getHeadHash(repoPath) {
  return execSync('git rev-parse HEAD', { cwd: repoPath, encoding: 'utf-8' }).trim();
}

/**
 * Check if a path is a valid git repo.
 */
export function isGitRepo(repoPath) {
  try {
    execSync('git rev-parse --git-dir', { cwd: repoPath, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Count total non-merge commits reachable from ref.
 */
export function countNonMergeCommits(repoPath, ref = 'HEAD') {
  try {
    const count = execSync(`git rev-list --no-merges --count ${ref}`, {
      cwd: repoPath,
      encoding: 'utf-8',
    }).trim();
    return parseInt(count, 10);
  } catch {
    return 0;
  }
}

/**
 * Parse git log output into structured commit data.
 * Uses streaming to handle large repos.
 * Yields commit objects with file changes.
 */
export function parseGitLog(repoPath, ref = 'HEAD', onCommit, onProgress) {
  return new Promise((resolve, reject) => {
    const DELIM = '---COMMIT_BOUNDARY---';
    const proc = spawn('git', [
      '-C', repoPath,
      'log', ref,
      '--no-merges',
      '--numstat',
      '-M50%',
      `--format=${DELIM}%nHASH:%H%nAUTHOR_NAME:%an%nAUTHOR_EMAIL:%ae%nCOMMITTER_DATE:%cd`,
      '--date=iso-strict',
    ], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let buffer = '';
    let commitCount = 0;
    let errorOutput = '';

    proc.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    proc.stdout.on('data', (chunk) => {
      buffer += chunk.toString();
      const parts = buffer.split(DELIM);
      // Keep last part as it may be incomplete
      buffer = parts.pop() || '';

      for (const part of parts) {
        const commit = parseCommitBlock(part.trim());
        if (commit) {
          onCommit(commit);
          commitCount++;
          if (onProgress) onProgress(commitCount);
        }
      }
    });

    proc.on('close', (code) => {
      // Process remaining buffer
      if (buffer.trim()) {
        const commit = parseCommitBlock(buffer.trim());
        if (commit) {
          onCommit(commit);
          commitCount++;
        }
      }
      if (code === 0) resolve(commitCount);
      else reject(new Error(`git log failed (code ${code}): ${errorOutput.slice(-500)}`));
    });

    proc.on('error', (err) => reject(err));
  });
}

function parseCommitBlock(block) {
  if (!block) return null;
  const lines = block.split('\n');

  let hash = null, authorName = null, authorEmail = null, committerDate = null;
  const files = [];

  for (const line of lines) {
    if (line.startsWith('HASH:')) {
      hash = line.slice(5).trim();
    } else if (line.startsWith('AUTHOR_NAME:')) {
      authorName = line.slice(12).trim();
    } else if (line.startsWith('AUTHOR_EMAIL:')) {
      authorEmail = line.slice(13).trim();
    } else if (line.startsWith('COMMITTER_DATE:')) {
      committerDate = line.slice(15).trim();
    } else if (line.match(/^[\d-]+\t[\d-]+\t/)) {
      // numstat line: added\tremoved\tpath  OR  -\t-\tpath (binary)
      const parts = line.split('\t');
      if (parts.length >= 3) {
        const added = parts[0];
        const removed = parts[1];
        // Handle rename: path is "old => new" or "{old => new}/path"
        let filePath = parts.slice(2).join('\t');
        let renamedFrom = null;

        // Git rename format: "old/path => new/path" or "{old => new}/rest"
        const renameMatch = filePath.match(/^(.*)?\{(.+?) => (.+?)\}(.*)$/) ||
                           filePath.match(/^(.+?) => (.+)$/);
        if (renameMatch) {
          if (renameMatch.length === 5) {
            // {old => new} format
            const prefix = renameMatch[1] || '';
            const oldPart = renameMatch[2];
            const newPart = renameMatch[3];
            const suffix = renameMatch[4] || '';
            renamedFrom = (prefix + oldPart + suffix).replace(/\/\//g, '/');
            filePath = (prefix + newPart + suffix).replace(/\/\//g, '/');
          } else {
            // simple "old => new" format
            renamedFrom = renameMatch[1].trim();
            filePath = renameMatch[2].trim();
          }
        }

        const isBinary = added === '-' && removed === '-';
        files.push({
          path: filePath,
          added: isBinary ? 0 : parseInt(added, 10),
          removed: isBinary ? 0 : parseInt(removed, 10),
          isBinary,
          renamedFrom,
        });
      }
    }
  }

  if (!hash) return null;

  return {
    hash,
    authorName: authorName || 'Unknown',
    authorEmail: authorEmail || 'unknown@unknown',
    committerDate: committerDate || new Date().toISOString(),
    files: files.filter(f => !f.isBinary), // Exclude binary files from metrics
  };
}

/**
 * Check if .mailmap exists in a repo and return its content.
 */
export function getMailmap(repoPath) {
  try {
    const content = execSync('git cat-file -p HEAD:.mailmap', {
      cwd: repoPath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return content;
  } catch {
    return null;
  }
}

/**
 * Parse .mailmap content into author mappings.
 * Format: Proper Name <proper@email> Commit Name <commit@email>
 *    or:  Proper Name <proper@email> <commit@email>
 *    or:  <proper@email> <commit@email>
 */
export function parseMailmap(content) {
  if (!content) return [];
  const mappings = [];
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Match: ProperName <proper@email> CommitName <commit@email>
    const full = trimmed.match(/^(.+?)\s+<([^>]+)>\s+(.+?)\s+<([^>]+)>$/);
    if (full) {
      mappings.push({
        canonicalName: full[1].trim(),
        canonicalEmail: full[2].trim(),
        aliasName: full[3].trim(),
        aliasEmail: full[4].trim(),
      });
      continue;
    }

    // Match: ProperName <proper@email> <commit@email>
    const nameEmail = trimmed.match(/^(.+?)\s+<([^>]+)>\s+<([^>]+)>$/);
    if (nameEmail) {
      mappings.push({
        canonicalName: nameEmail[1].trim(),
        canonicalEmail: nameEmail[2].trim(),
        aliasName: null,
        aliasEmail: nameEmail[3].trim(),
      });
      continue;
    }

    // Match: <proper@email> <commit@email>
    const emailOnly = trimmed.match(/^<([^>]+)>\s+<([^>]+)>$/);
    if (emailOnly) {
      mappings.push({
        canonicalName: null,
        canonicalEmail: emailOnly[1].trim(),
        aliasName: null,
        aliasEmail: emailOnly[2].trim(),
      });
      continue;
    }
  }

  return mappings;
}
