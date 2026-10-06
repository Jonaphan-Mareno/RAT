import { getDb } from './db.js';

/**
 * Build the author resolution lookup for a repo.
 * Returns a function: (name, email) => { canonicalName, canonicalEmail }
 */
export function buildAuthorResolver(repoId) {
  const db = getDb();
  const aliases = db.prepare(`
    SELECT aa.name, aa.email, ag.canonical_name, ag.canonical_email
    FROM author_aliases aa
    JOIN author_groups ag ON aa.group_id = ag.id
    WHERE ag.repo_id = ?
  `).all(repoId);

  const map = new Map();
  for (const a of aliases) {
    map.set(`${a.name}|${a.email}`, { name: a.canonical_name, email: a.canonical_email });
  }

  return (name, email) => {
    const key = `${name}|${email}`;
    return map.get(key) || { name, email };
  };
}

/**
 * Build the filtered commit set H based on filters.
 * Returns an array of commit IDs.
 */
export function getFilteredCommitIds(repoId, filters = {}) {
  const db = getDb();
  let sql = 'SELECT id, hash, author_name, author_email, committer_date FROM commits WHERE repo_id = ?';
  const params = [repoId];

  // Time filters (committer_date): fromDate inclusive, toDate exclusive
  if (filters.fromDate) {
    sql += ' AND committer_date >= ?';
    params.push(filters.fromDate);
  }
  if (filters.toDate) {
    sql += ' AND committer_date < ?';
    params.push(filters.toDate);
  }

  // Manual commit hash selection
  if (filters.commitHashes && filters.commitHashes.length > 0) {
    const placeholders = filters.commitHashes.map(() => '?').join(',');
    sql += ` AND hash IN (${placeholders})`;
    params.push(...filters.commitHashes);
  }

  sql += ' ORDER BY committer_date DESC';

  let commits = db.prepare(sql).all(...params);

  // Author filter (applied after fetching, to support merged identities)
  if (filters.author) {
    const resolver = buildAuthorResolver(repoId);
    commits = commits.filter(c => {
      const resolved = resolver(c.author_name, c.author_email);
      return resolved.name === filters.author || resolved.email === filters.author;
    });
  }

  return commits;
}

/**
 * Get file metrics for a single commit and file.
 * l+(h,f), l-(h,f), delta(h,f), churn(h,f)
 */
export function getFileMetrics(repoId, commitHash, filePath) {
  const db = getDb();
  const row = db.prepare(`
    SELECT fc.added_lines, fc.removed_lines, fc.renamed_from
    FROM file_changes fc
    JOIN commits c ON fc.commit_id = c.id
    WHERE c.repo_id = ? AND c.hash = ? AND fc.file_path = ?
  `).get(repoId, commitHash, filePath);

  if (!row) return { added: 0, removed: 0, growth: 0, churn: 0 };

  return {
    added: row.added_lines,
    removed: row.removed_lines,
    growth: row.added_lines - row.removed_lines,
    churn: row.added_lines + row.removed_lines,
    renamedFrom: row.renamed_from,
  };
}

/**
 * Get all file changes for a single commit.
 */
export function getCommitFileChanges(repoId, commitHash) {
  const db = getDb();
  return db.prepare(`
    SELECT fc.file_path, fc.added_lines, fc.removed_lines, fc.renamed_from
    FROM file_changes fc
    JOIN commits c ON fc.commit_id = c.id
    WHERE c.repo_id = ? AND c.hash = ?
  `).all(repoId, commitHash);
}

/**
 * Get directory metrics for a single commit.
 * Uses immediate-children semantics: only files directly in the dir.
 */
export function getDirectoryMetrics(repoId, commitHash, dirPath) {
  const db = getDb();
  // Normalize dir path
  const normalizedDir = dirPath === '/' || dirPath === '' || dirPath === '.' ? '' : dirPath.replace(/\/$/, '');

  let rows;
  if (normalizedDir === '') {
    // Root directory: files where path has no slash (immediate children of root)
    // Plus aggregate subdirectory values
    rows = db.prepare(`
      SELECT fc.file_path, fc.added_lines, fc.removed_lines
      FROM file_changes fc
      JOIN commits c ON fc.commit_id = c.id
      WHERE c.repo_id = ? AND c.hash = ?
    `).all(repoId, commitHash);
  } else {
    // Specific directory: files under this path
    rows = db.prepare(`
      SELECT fc.file_path, fc.added_lines, fc.removed_lines
      FROM file_changes fc
      JOIN commits c ON fc.commit_id = c.id
      WHERE c.repo_id = ? AND c.hash = ? AND (fc.file_path LIKE ? OR fc.file_path LIKE ?)
    `).all(repoId, commitHash, normalizedDir + '/%', normalizedDir);
  }

  // Aggregate: sum all files under this directory (recursive, since dir metrics are recursive)
  return aggregateFromFiles(rows, normalizedDir);
}

function aggregateFromFiles(rows, dirPath) {
  let added = 0, removed = 0;
  const prefix = dirPath === '' ? '' : dirPath + '/';

  for (const row of rows) {
    // Check if file is under this directory
    if (prefix === '' || row.file_path.startsWith(prefix) || row.file_path === dirPath) {
      added += row.added_lines;
      removed += row.removed_lines;
    }
  }

  return {
    added,
    removed,
    growth: added - removed,
    churn: added + removed,
  };
}

/**
 * Commit Set Metrics: aggregate over filtered commit set H for an object.
 * l+(H,o), l-(H,o), delta(H,o), churn(H,o), n(H,o), eta(H,o), rho(H,o)
 */
export function getCommitSetMetrics(repoId, filters = {}, objectPath = null) {
  const db = getDb();
  const commits = getFilteredCommitIds(repoId, filters);
  const commitIds = commits.map(c => c.id);
  const H_size = commitIds.length;

  if (H_size === 0) {
    return { objects: [], H_size: 0 };
  }

  // Build query based on whether we have a path filter
  let sql;
  let params;

  if (objectPath !== null && objectPath !== '' && objectPath !== '/') {
    // Specific file or directory
    const isDir = !objectPath.includes('.') || objectPath.endsWith('/');
    if (isDir) {
      const dirPrefix = objectPath.replace(/\/$/, '') + '/';
      sql = `
        SELECT fc.file_path,
               SUM(fc.added_lines) as total_added,
               SUM(fc.removed_lines) as total_removed,
               COUNT(DISTINCT CASE WHEN (fc.added_lines + fc.removed_lines) > 0 THEN fc.commit_id END) as modifications
        FROM file_changes fc
        WHERE fc.commit_id IN (${commitIds.join(',')})
          AND (fc.file_path LIKE ? OR fc.file_path = ?)
        GROUP BY fc.file_path
      `;
      params = [dirPrefix + '%', objectPath.replace(/\/$/, '')];
    } else {
      sql = `
        SELECT fc.file_path,
               SUM(fc.added_lines) as total_added,
               SUM(fc.removed_lines) as total_removed,
               COUNT(DISTINCT CASE WHEN (fc.added_lines + fc.removed_lines) > 0 THEN fc.commit_id END) as modifications
        FROM file_changes fc
        WHERE fc.commit_id IN (${commitIds.join(',')})
          AND fc.file_path = ?
        GROUP BY fc.file_path
      `;
      params = [objectPath];
    }
  } else {
    // All objects
    sql = `
      SELECT fc.file_path,
             SUM(fc.added_lines) as total_added,
             SUM(fc.removed_lines) as total_removed,
             COUNT(DISTINCT CASE WHEN (fc.added_lines + fc.removed_lines) > 0 THEN fc.commit_id END) as modifications
      FROM file_changes fc
      WHERE fc.commit_id IN (${commitIds.join(',')})
      GROUP BY fc.file_path
    `;
    params = [];
  }

  const rows = db.prepare(sql).all(...params);

  const objects = rows.map(row => ({
    path: row.file_path,
    added: row.total_added,
    removed: row.total_removed,
    growth: row.total_added - row.total_removed,
    churn: row.total_added + row.total_removed,
    modifications: row.modifications,
    modificationFreq: H_size > 0 ? row.modifications / H_size : 0,
    churnRate: H_size > 0 ? (row.total_added + row.total_removed) / H_size : 0,
  }));

  // Also compute directory aggregates
  const dirMetrics = computeDirectoryAggregates(objects, H_size);

  return {
    files: objects,
    directories: dirMetrics,
    H_size,
  };
}

/**
 * Compute directory-level aggregates from file-level metrics.
 * Bottom-up: each directory sums its immediate children (files and subdirs).
 */
function computeDirectoryAggregates(fileObjects, H_size) {
  const dirMap = new Map(); // dirPath -> { added, removed, churn, modifications_set }

  // Collect all unique directories
  for (const obj of fileObjects) {
    const parts = obj.path.split('/');
    // Add all parent directories
    for (let i = 0; i < parts.length; i++) {
      const dir = i === 0 ? '' : parts.slice(0, i).join('/');
      if (!dirMap.has(dir)) {
        dirMap.set(dir, { added: 0, removed: 0, churn: 0, modifications: 0, commitIds: new Set() });
      }
    }
  }

  // For each file, add its metrics to its direct parent dir and all ancestors
  for (const obj of fileObjects) {
    const parts = obj.path.split('/');
    for (let i = 0; i < parts.length; i++) {
      const dir = i === 0 ? '' : parts.slice(0, i).join('/');
      if (dirMap.has(dir)) {
        const d = dirMap.get(dir);
        d.added += obj.added;
        d.removed += obj.removed;
        d.churn += obj.churn;
        d.modifications += obj.modifications;
      }
    }
  }

  return Array.from(dirMap.entries()).map(([dirPath, m]) => ({
    path: dirPath || '/',
    added: m.added,
    removed: m.removed,
    growth: m.added - m.removed,
    churn: m.churn,
    modifications: m.modifications,
    modificationFreq: H_size > 0 ? m.modifications / H_size : 0,
    churnRate: H_size > 0 ? m.churn / H_size : 0,
  }));
}

/**
 * Repository metrics = root directory metrics over the commit set.
 */
export function getRepositoryMetrics(repoId, filters = {}) {
  const result = getCommitSetMetrics(repoId, filters);
  const rootDir = result.directories?.find(d => d.path === '/');
  return {
    ...rootDir,
    H_size: result.H_size,
    fileCount: result.files?.length || 0,
    dirCount: result.directories?.length || 0,
  };
}

/**
 * Author metrics: n(H,o,a), lambda(H,o,a), omega(H,o,a) for all authors.
 */
export function getAuthorMetrics(repoId, filters = {}) {
  const db = getDb();
  const commits = getFilteredCommitIds(repoId, filters);
  const H_size = commits.length;

  if (H_size === 0) return { authors: [], H_size: 0 };

  const resolver = buildAuthorResolver(repoId);

  // Group commits by resolved author
  const authorCommits = new Map(); // canonical author key -> [commitIds]
  for (const commit of commits) {
    const resolved = resolver(commit.author_name, commit.author_email);
    const key = `${resolved.name}|${resolved.email}`;
    if (!authorCommits.has(key)) {
      authorCommits.set(key, { name: resolved.name, email: resolved.email, commitIds: [] });
    }
    authorCommits.get(key).commitIds.push(commit.id);
  }

  // For each author, compute per-object metrics
  const allCommitIds = commits.map(c => c.id);
  const authorResults = [];

  // Get total churn per file across all commits in H (for ownership denominator)
  const totalChurnSql = `
    SELECT fc.file_path, SUM(fc.added_lines + fc.removed_lines) as total_churn
    FROM file_changes fc
    WHERE fc.commit_id IN (${allCommitIds.join(',')})
    GROUP BY fc.file_path
  `;
  const totalChurnRows = db.prepare(totalChurnSql).all();
  const totalChurnMap = new Map();
  for (const r of totalChurnRows) {
    totalChurnMap.set(r.file_path, r.total_churn);
  }

  for (const [, authorData] of authorCommits) {
    const ids = authorData.commitIds;
    if (ids.length === 0) continue;

    const sql = `
      SELECT fc.file_path,
             SUM(fc.added_lines + fc.removed_lines) as author_churn,
             COUNT(DISTINCT CASE WHEN (fc.added_lines + fc.removed_lines) > 0 THEN fc.commit_id END) as author_modifications
      FROM file_changes fc
      WHERE fc.commit_id IN (${ids.join(',')})
      GROUP BY fc.file_path
    `;
    const rows = db.prepare(sql).all();

    const fileMetrics = rows.map(r => {
      const totalChurn = totalChurnMap.get(r.file_path) || 0;
      return {
        path: r.file_path,
        authorChurn: r.author_churn,
        authorModifications: r.author_modifications,
        ownership: totalChurn > 0 ? r.author_churn / totalChurn : 0,
      };
    });

    // Aggregate total for this author
    const totalAuthorChurn = fileMetrics.reduce((s, f) => s + f.authorChurn, 0);
    const totalAuthorMods = fileMetrics.reduce((s, f) => s + f.authorModifications, 0);
    const totalAllChurn = Array.from(totalChurnMap.values()).reduce((s, v) => s + v, 0);

    authorResults.push({
      name: authorData.name,
      email: authorData.email,
      commitCount: ids.length,
      totalChurn: totalAuthorChurn,
      totalModifications: totalAuthorMods,
      overallOwnership: totalAllChurn > 0 ? totalAuthorChurn / totalAllChurn : 0,
      files: fileMetrics.slice(0, 100), // Limit for API response size
    });
  }

  return {
    authors: authorResults.sort((a, b) => b.totalChurn - a.totalChurn),
    H_size,
  };
}

/**
 * Get all unique authors for a repo (with merge group info).
 */
export function getAuthors(repoId) {
  const db = getDb();

  // Get all raw authors
  const rawAuthors = db.prepare(
    'SELECT DISTINCT author_name as name, author_email as email, COUNT(*) as commit_count FROM commits WHERE repo_id = ? GROUP BY author_name, author_email'
  ).all(repoId);

  // Get merge groups
  const groups = db.prepare(`
    SELECT ag.id, ag.canonical_name, ag.canonical_email, ag.source,
           aa.name as alias_name, aa.email as alias_email
    FROM author_groups ag
    LEFT JOIN author_aliases aa ON aa.group_id = ag.id
    WHERE ag.repo_id = ?
  `).all(repoId);

  // Build group map
  const groupMap = new Map();
  for (const g of groups) {
    if (!groupMap.has(g.id)) {
      groupMap.set(g.id, {
        id: g.id,
        canonicalName: g.canonical_name,
        canonicalEmail: g.canonical_email,
        source: g.source,
        aliases: [],
      });
    }
    if (g.alias_name) {
      groupMap.get(g.id).aliases.push({ name: g.alias_name, email: g.alias_email });
    }
  }

  // Build resolved author list
  const resolver = buildAuthorResolver(repoId);
  const resolvedMap = new Map();
  for (const author of rawAuthors) {
    const resolved = resolver(author.name, author.email);
    const key = `${resolved.name}|${resolved.email}`;
    if (!resolvedMap.has(key)) {
      resolvedMap.set(key, {
        name: resolved.name,
        email: resolved.email,
        commitCount: 0,
        aliases: [],
      });
    }
    const entry = resolvedMap.get(key);
    entry.commitCount += author.commit_count;
    if (author.name !== resolved.name || author.email !== resolved.email) {
      entry.aliases.push({ name: author.name, email: author.email });
    }
  }

  return {
    authors: Array.from(resolvedMap.values()).sort((a, b) => b.commitCount - a.commitCount),
    groups: Array.from(groupMap.values()),
  };
}
