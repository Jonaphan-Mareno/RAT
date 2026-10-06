import { Router } from 'express';
import { getDb } from '../db.js';
import {
  getFileMetrics,
  getCommitFileChanges,
  getDirectoryMetrics,
  getCommitSetMetrics,
  getRepositoryMetrics,
  getAuthorMetrics,
  getFilteredCommitIds,
} from '../metrics.js';

const router = Router();

function parseFilters(query) {
  const filters = {};
  if (query.fromDate) filters.fromDate = query.fromDate;
  if (query.toDate) filters.toDate = query.toDate;
  if (query.commitHashes) filters.commitHashes = query.commitHashes.split(',').filter(Boolean);
  if (query.author) filters.author = query.author;
  return filters;
}

// File metrics for a single commit + file
router.get('/:id/metrics/file', (req, res) => {
  try {
    const repoId = Number(req.params.id);
    const { commit, path: filePath } = req.query;

    if (commit && filePath) {
      // Single commit, single file
      const metrics = getFileMetrics(repoId, commit, filePath);
      return res.json(metrics);
    }

    if (commit) {
      // All files for a commit
      const files = getCommitFileChanges(repoId, commit);
      return res.json(files.map(f => ({
        path: f.file_path,
        added: f.added_lines,
        removed: f.removed_lines,
        growth: f.added_lines - f.removed_lines,
        churn: f.added_lines + f.removed_lines,
        renamedFrom: f.renamed_from,
      })));
    }

    // File metrics over commit set
    const filters = parseFilters(req.query);
    if (filePath) {
      filters.path = filePath;
    }
    const result = getCommitSetMetrics(repoId, filters, filePath || null);
    res.json(result);
  } catch (error) {
    console.error('File metrics error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Directory metrics
router.get('/:id/metrics/directory', (req, res) => {
  try {
    const repoId = Number(req.params.id);
    const { commit, path: dirPath = '' } = req.query;

    if (commit) {
      const metrics = getDirectoryMetrics(repoId, commit, dirPath);
      return res.json(metrics);
    }

    // Over commit set
    const filters = parseFilters(req.query);
    const result = getCommitSetMetrics(repoId, filters, dirPath || '/');
    res.json(result);
  } catch (error) {
    console.error('Directory metrics error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Repository metrics (root directory over commit set)
router.get('/:id/metrics/repository', (req, res) => {
  try {
    const repoId = Number(req.params.id);
    const filters = parseFilters(req.query);
    const metrics = getRepositoryMetrics(repoId, filters);
    res.json(metrics);
  } catch (error) {
    console.error('Repository metrics error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Commit set metrics (all objects over filtered H)
router.get('/:id/metrics/commit-set', (req, res) => {
  try {
    const repoId = Number(req.params.id);
    const filters = parseFilters(req.query);
    const { path: objPath } = req.query;
    const result = getCommitSetMetrics(repoId, filters, objPath || null);
    res.json(result);
  } catch (error) {
    console.error('Commit set metrics error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Author metrics
router.get('/:id/metrics/author', (req, res) => {
  try {
    const repoId = Number(req.params.id);
    const filters = parseFilters(req.query);
    const result = getAuthorMetrics(repoId, filters);
    res.json(result);
  } catch (error) {
    console.error('Author metrics error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
