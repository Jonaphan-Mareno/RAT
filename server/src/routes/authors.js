import { Router } from 'express';
import { getDb } from '../db.js';
import { getAuthors, buildAuthorResolver } from '../metrics.js';

const router = Router();

// Get all authors for a repo
router.get('/:id/authors', (req, res) => {
  try {
    const repoId = Number(req.params.id);
    const result = getAuthors(repoId);
    res.json(result);
  } catch (error) {
    console.error('Authors error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Merge authors manually
router.post('/:id/authors/merge', (req, res) => {
  try {
    const db = getDb();
    const repoId = Number(req.params.id);
    const { authors, canonicalName, canonicalEmail } = req.body;

    if (!authors || authors.length < 2) {
      return res.status(400).json({ error: 'At least 2 authors are required for merging' });
    }
    if (!canonicalName || !canonicalEmail) {
      return res.status(400).json({ error: 'Canonical name and email are required' });
    }

    const transaction = db.transaction(() => {
      // Create group
      const groupResult = db.prepare(
        'INSERT INTO author_groups (repo_id, canonical_name, canonical_email, source) VALUES (?, ?, ?, ?)'
      ).run(repoId, canonicalName, canonicalEmail, 'manual');
      const groupId = groupResult.lastInsertRowid;

      // Add aliases
      const insertAlias = db.prepare(
        'INSERT OR IGNORE INTO author_aliases (group_id, name, email) VALUES (?, ?, ?)'
      );
      for (const author of authors) {
        insertAlias.run(groupId, author.name, author.email);
      }

      return groupId;
    });

    const groupId = transaction();
    res.json({ groupId, success: true });
  } catch (error) {
    console.error('Author merge error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Unmerge (delete group)
router.delete('/:id/authors/groups/:groupId', (req, res) => {
  try {
    const db = getDb();
    const groupId = Number(req.params.groupId);
    db.prepare('DELETE FROM author_aliases WHERE group_id = ?').run(groupId);
    db.prepare('DELETE FROM author_groups WHERE id = ?').run(groupId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
