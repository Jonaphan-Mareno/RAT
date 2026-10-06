import { getDb } from './db.js';

function createMetric(path) {
  return {
    path,
    added: 0,
    removed: 0,
    modifications: 0,
    authors: new Map(),
  };
}

function createAuthorMetric(name, email) {
  return {
    name,
    email,
    added: 0,
    removed: 0,
    modifications: 0,
  };
}

function getAuthorMetric(metric, author) {
  const key = `${author.name}\u0000${author.email}`;
  let authorMetric = metric.authors.get(key);
  if (!authorMetric) {
    authorMetric = createAuthorMetric(author.name, author.email);
    metric.authors.set(key, authorMetric);
  }
  return authorMetric;
}

function addChange(metric, author, added, removed) {
  metric.added += added;
  metric.removed += removed;
  const authorMetric = getAuthorMetric(metric, author);
  authorMetric.added += added;
  authorMetric.removed += removed;
  return authorMetric;
}

function parentDirectories(filePath) {
  const parts = filePath.split('/');
  const directories = [];
  for (let i = 1; i < parts.length; i++) {
    directories.push(parts.slice(0, i).join('/'));
  }
  return directories;
}

function finalizeMetric(metric, HSize) {
  const churn = metric.added + metric.removed;
  return {
    path: metric.path,
    added: metric.added,
    removed: metric.removed,
    growth: metric.added - metric.removed,
    churn,
    modifications: metric.modifications,
    modificationFreq: HSize > 0 ? metric.modifications / HSize : 0,
    churnRate: HSize > 0 ? churn / HSize : 0,
  };
}

function finalizeAuthorMetric(authorMetric, totalChurn) {
  const churn = authorMetric.added + authorMetric.removed;
  return {
    name: authorMetric.name,
    email: authorMetric.email,
    author: `${authorMetric.name} <${authorMetric.email}>`,
    added: authorMetric.added,
    removed: authorMetric.removed,
    growth: authorMetric.added - authorMetric.removed,
    churn,
    modifications: authorMetric.modifications,
    ownership: totalChurn > 0 ? churn / totalChurn : 0,
  };
}

function finalizeObject(metric, HSize) {
  const aggregate = finalizeMetric(metric, HSize);
  const authors = Array.from(metric.authors.values())
    .map(authorMetric => finalizeAuthorMetric(authorMetric, aggregate.churn))
    .filter(authorMetric => authorMetric.churn > 0)
    .sort((a, b) => b.churn - a.churn || a.author.localeCompare(b.author));
  return { ...aggregate, authors };
}

/**
 * Build exact file, directory, repository, and per-author metrics for a commit set.
 * Modification counts are distinct commits per object, not sums of child counts.
 */
export function buildMetricSnapshot(repoId, commits, resolveAuthor) {
  const HSize = commits.length;
  const repository = createMetric('/');
  const files = new Map();
  const directories = new Map();
  const authorCommitCounts = new Map();

  for (const commit of commits) {
    const author = resolveAuthor(commit.author_name, commit.author_email);
    const key = `${author.name}\u0000${author.email}`;
    const existing = authorCommitCounts.get(key);
    if (existing) {
      existing.commitCount += 1;
    } else {
      authorCommitCounts.set(key, { ...author, commitCount: 1 });
    }
  }

  if (HSize === 0) {
    return {
      H_size: 0,
      repository: finalizeObject(repository, 0),
      files: [],
      directories: [],
      authorCommitCounts,
    };
  }

  const commitIds = commits.map(commit => Number(commit.id));
  const commitAuthors = new Map(
    commits.map(commit => [
      Number(commit.id),
      resolveAuthor(commit.author_name, commit.author_email),
    ])
  );

  // Use temp table for large commit sets to avoid huge IN(...) clauses (H3)
  const db = getDb();
  const useTempTable = commitIds.length > 500;
  if (useTempTable) {
    db.exec('CREATE TEMP TABLE IF NOT EXISTS _tmp_commit_ids (id INTEGER PRIMARY KEY)');
    db.exec('DELETE FROM _tmp_commit_ids');
    const insertTmp = db.prepare('INSERT OR IGNORE INTO _tmp_commit_ids (id) VALUES (?)');
    const batchInsert = db.transaction((ids) => {
      for (const id of ids) insertTmp.run(id);
    });
    batchInsert(commitIds);
  }

  const sql = useTempTable
    ? `SELECT fc.commit_id, fc.file_path, fc.renamed_from, fc.added_lines, fc.removed_lines
       FROM file_changes fc
       INNER JOIN _tmp_commit_ids t ON fc.commit_id = t.id
       ORDER BY fc.commit_id, fc.id`
    : `SELECT fc.commit_id, fc.file_path, fc.renamed_from, fc.added_lines, fc.removed_lines
       FROM file_changes fc
       WHERE fc.commit_id IN (${commitIds.join(',')})
       ORDER BY fc.commit_id, fc.id`;

  let currentCommitId = null;
  let touchedMetrics = new Set();

  const finishCommit = () => {
    for (const metric of touchedMetrics) metric.modifications += 1;
    touchedMetrics = new Set();
  };

  for (const row of db.prepare(sql).iterate()) {
    const commitId = Number(row.commit_id);
    if (currentCommitId !== null && commitId !== currentCommitId) finishCommit();
    currentCommitId = commitId;

    const author = commitAuthors.get(commitId);
    const added = Number(row.added_lines);
    const removed = Number(row.removed_lines);
    const hasChurn = added + removed > 0;

    if (row.renamed_from && !files.has(row.renamed_from)) {
      files.set(row.renamed_from, createMetric(row.renamed_from));
      for (const directoryPath of parentDirectories(row.renamed_from)) {
        if (!directories.has(directoryPath)) {
          directories.set(directoryPath, createMetric(directoryPath));
        }
      }
    }

    const repositoryAuthor = addChange(repository, author, added, removed);
    if (hasChurn) {
      touchedMetrics.add(repository);
      touchedMetrics.add(repositoryAuthor);
    }

    let fileMetric = files.get(row.file_path);
    if (!fileMetric) {
      fileMetric = createMetric(row.file_path);
      files.set(row.file_path, fileMetric);
    }
    const fileAuthor = addChange(fileMetric, author, added, removed);
    if (hasChurn) {
      touchedMetrics.add(fileMetric);
      touchedMetrics.add(fileAuthor);
    }

    for (const directoryPath of parentDirectories(row.file_path)) {
      let directoryMetric = directories.get(directoryPath);
      if (!directoryMetric) {
        directoryMetric = createMetric(directoryPath);
        directories.set(directoryPath, directoryMetric);
      }
      const directoryAuthor = addChange(directoryMetric, author, added, removed);
      if (hasChurn) {
        touchedMetrics.add(directoryMetric);
        touchedMetrics.add(directoryAuthor);
      }
    }
  }
  if (currentCommitId !== null) finishCommit();

  // Clean up temp table
  if (useTempTable) {
    db.exec('DELETE FROM _tmp_commit_ids');
  }

  return {
    H_size: HSize,
    repository: finalizeObject(repository, HSize),
    files: Array.from(files.values())
      .map(metric => finalizeObject(metric, HSize))
      .sort((a, b) => a.path.localeCompare(b.path)),
    directories: Array.from(directories.values())
      .map(metric => finalizeObject(metric, HSize))
      .sort((a, b) => a.path.localeCompare(b.path)),
    authorCommitCounts,
  };
}

export function snapshotToReferenceRows(snapshot) {
  const rows = [];
  const appendObject = (objectType, metric) => {
    rows.push({
      object_type: objectType,
      path: metric.path,
      author: 'ALL',
      added: metric.added,
      removed: metric.removed,
      growth: metric.growth,
      churn: metric.churn,
      modifications: metric.modifications,
      modification_frequency: metric.modificationFreq,
      churn_rate: metric.churnRate,
      ownership: null,
    });
    for (const authorMetric of metric.authors) {
      rows.push({
        object_type: objectType,
        path: metric.path,
        author: authorMetric.author,
        added: authorMetric.added,
        removed: authorMetric.removed,
        growth: authorMetric.growth,
        churn: authorMetric.churn,
        modifications: authorMetric.modifications,
        modification_frequency: null,
        churn_rate: null,
        ownership: authorMetric.ownership,
      });
    }
  };

  appendObject('repository', snapshot.repository);
  for (const metric of snapshot.directories) appendObject('directory', metric);
  for (const metric of snapshot.files) appendObject('file', metric);
  return rows;
}
