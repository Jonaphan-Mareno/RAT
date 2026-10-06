import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import repoRoutes from './routes/repos.js';
import metricRoutes from './routes/metrics.js';
import authorRoutes from './routes/authors.js';
import { getDb } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// API routes
app.use('/api/repos', repoRoutes);
app.use('/api/repos', metricRoutes);
app.use('/api/repos', authorRoutes);

// Serve static frontend in production
const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(clientDist, 'index.html'));
  }
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// Initialize DB
getDb();

app.listen(PORT, () => {
  console.log(`RAT server running on http://localhost:${PORT}`);
});
