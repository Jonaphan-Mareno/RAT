import { getDb } from './db.js';
import { buildMetricSnapshot } from './metricSnapshot.js';

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
export function getMetricSnapshot(repoId, filters = {}) {
  const commits = getFilteredCommitIds(repoId, filters);
  return buildMetricSnapshot(repoId, commits, buildAuthorResolver(repoId));
}

export function getCommitSetMetrics(repoId, filters = {}, objectPath = null) {
  const snapshot = getMetricSnapshot(repoId, filters);
  let files = snapshot.files;
  let directories = snapshot.directories;

  if (objectPath !== null && objectPath !== '' && objectPath !== '/') {
    const normalizedPath = objectPath.replace(/\/$/, '');
    const exactFile = files.find(file => file.path === normalizedPath);
    if (exactFile) {
      files = [exactFile];
      directories = [];
    } else {
      const prefix = `${normalizedPath}/`;
      files = files.filter(file => file.path.startsWith(prefix));
      directories = directories.filter(directory =>
        directory.path === normalizedPath || directory.path.startsWith(prefix)
      );
    }
  }

  return {
    files: files.map(({ authors, ...metric }) => metric),
    directories: directories.map(({ authors, ...metric }) => metric),
    H_size: snapshot.H_size,
  };
}

/**
 * Repository metrics = all non-binary file changes over the commit set.
 */
export function getRepositoryMetrics(repoId, filters = {}) {
  const snapshot = getMetricSnapshot(repoId, filters);
  const { authors, ...repository } = snapshot.repository;
  return {
    ...repository,
    H_size: snapshot.H_size,
    fileCount: snapshot.files.length,
    dirCount: snapshot.directories.length,
  };
}

/**
 * Author metrics: n(H,o,a), lambda(H,o,a), omega(H,o,a) for all authors.
 */
export function getAuthorMetrics(repoId, filters = {}) {
  const snapshot = getMetricSnapshot(repoId, filters);
  const authors = snapshot.repository.authors.map(authorMetric => {
    const key = `${authorMetric.name}\u0000${authorMetric.email}`;
    const commitCount = snapshot.authorCommitCounts.get(key)?.commitCount || 0;
    const files = snapshot.files.flatMap(file => {
      const metric = file.authors.find(author => author.name === authorMetric.name && author.email === authorMetric.email);
      if (!metric) return [];
      return [{
        path: file.path,
        added: metric.added,
        removed: metric.removed,
        growth: metric.growth,
        authorChurn: metric.churn,
        authorModifications: metric.modifications,
        ownership: metric.ownership,
      }];
    });

    return {
      name: authorMetric.name,
      email: authorMetric.email,
      commitCount,
      added: authorMetric.added,
      removed: authorMetric.removed,
      growth: authorMetric.growth,
      totalChurn: authorMetric.churn,
      totalModifications: authorMetric.modifications,
      overallOwnership: authorMetric.ownership,
      files: files.slice(0, 100),
    };
  });

  return { authors, H_size: snapshot.H_size };
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
