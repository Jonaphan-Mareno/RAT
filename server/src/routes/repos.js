import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { getDb } from '../db.js';
import { ingestFromUrl, ingestFromZip, deleteRepo, addSSEClient } from '../ingestion/manager.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.join(__dirname, '..', '..', 'data', 'uploads');

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const upload = multer({
  dest: UPLOADS_DIR,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/zip' || file.mimetype === 'application/x-zip-compressed' ||
        file.originalname.endsWith('.zip')) {
      cb(null, true);
    } else {
      cb(new Error('Only .zip files are accepted'));
    }
  },
});

const router = Router();

// List all repos
router.get('/', (req, res) => {
  const db = getDb();
  const repos = db.prepare('SELECT * FROM repositories ORDER BY created_at DESC').all();
  res.json(repos);
});

// Get single repo
router.get('/:id', (req, res) => {
  const db = getDb();
  const repo = db.prepare('SELECT * FROM repositories WHERE id = ?').get(req.params.id);
  if (!repo) return res.status(404).json({ error: 'Repository not found' });
  res.json(repo);
});

// Clone a repo from URL
router.post('/clone', async (req, res) => {
  try {
    const { url, name } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });

    // Basic URL validation - allow http(s), git@, and local paths
    if (!url.match(/^https?:\/\/.+/) && !url.match(/^git@.+/) && !url.startsWith('/')) {
      return res.status(400).json({ error: 'Invalid repository URL' });
    }

    const repoId = await ingestFromUrl(url, name);
    res.json({ id: repoId, status: 'ingesting' });
  } catch (error) {
    console.error('Clone error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Upload zip
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const name = req.body.name || req.file.originalname.replace('.zip', '');
    const repoId = await ingestFromZip(req.file.path, name);
    res.json({ id: repoId, status: 'ingesting' });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete repo
router.delete('/:id', (req, res) => {
  try {
    deleteRepo(Number(req.params.id));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// SSE status stream
router.get('/:id/status', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const repoId = Number(req.params.id);
  addSSEClient(repoId, res);

  // Send current status immediately
  const db = getDb();
  const repo = db.prepare('SELECT status, progress_pct, commit_count, error_message FROM repositories WHERE id = ?').get(repoId);
  if (repo) {
    res.write(`data: ${JSON.stringify({ status: repo.status, pct: repo.progress_pct, totalCommits: repo.commit_count, error: repo.error_message })}\n\n`);
  }
});

// Get commits with filters
router.get('/:id/commits', (req, res) => {
  const db = getDb();
  const repoId = Number(req.params.id);
  const { page = 1, limit = 50, fromDate, toDate, author, search } = req.query;

  let sql = 'SELECT * FROM commits WHERE repo_id = ?';
  const params = [repoId];

  if (fromDate) { sql += ' AND committer_date >= ?'; params.push(fromDate); }
  if (toDate) { sql += ' AND committer_date < ?'; params.push(toDate); }
  if (author) {
    sql += ' AND (author_name = ? OR author_email = ?)';
    params.push(author, author);
  }
  if (search) {
    sql += ' AND hash LIKE ?';
    params.push(search + '%');
  }

  const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as count');
  const total = db.prepare(countSql).get(...params).count;

  sql += ' ORDER BY committer_date DESC LIMIT ? OFFSET ?';
  params.push(Number(limit), (Number(page) - 1) * Number(limit));

  const commits = db.prepare(sql).all(...params);
  res.json({ commits, total, page: Number(page), limit: Number(limit) });
});

// Get file tree
router.get('/:id/files', (req, res) => {
  const db = getDb();
  const repoId = Number(req.params.id);

  const paths = db.prepare(`
    SELECT DISTINCT fc.file_path
    FROM file_changes fc
    JOIN commits c ON fc.commit_id = c.id
    WHERE c.repo_id = ?
    ORDER BY fc.file_path
  `).all(repoId);

  res.json(paths.map(p => p.file_path));
});

export default router;
