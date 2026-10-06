# RAT — Repo Analysis Tool

A web-app dashboard for analyzing git repository metrics: file churn, directory aggregates, commit set statistics, author ownership, and more.

## Overview

RAT ingests git repositories (via clone URL or zip upload) and computes exact line-level metrics as defined by the COMS3011A specification. It supports multiple repos simultaneously, filtering by author/date/file/commit, author identity merging (`.mailmap` + manual), and provides interactive visualizations.

## Architecture

```
┌──────────────────────────────────────────────┐
│                  Client                       │
│   React 18 + Vite + TailwindCSS + Recharts   │
│   Dashboard, Filters, Metric Tabs, Charts     │
└──────────────┬───────────────────────────────┘
               │ REST API (fetch)
┌──────────────▼───────────────────────────────┐
│                  Server                       │
│   Express.js + better-sqlite3 + multer       │
│   Routes: /api/repos, /api/repos/:id/metrics │
│   Ingestion: git clone / zip extract          │
│   Metric Engine: SQL aggregation              │
└──────────────┬───────────────────────────────┘
               │ git CLI (plumbing)
┌──────────────▼───────────────────────────────┐
│   Git Repositories (cloned/extracted)         │
│   git log --no-merges --numstat -M50%         │
└──────────────────────────────────────────────┘
```

**Tech Stack:**
- **Backend**: Node.js, Express, better-sqlite3 (WAL mode, indexed), multer, adm-zip
- **Frontend**: React 18, Vite, TailwindCSS, Recharts, React Router, react-hot-toast
- **Database**: SQLite with indexes on commit dates, hashes, file paths, author identities
- **Git**: Shell out to `git` CLI — `git log --no-merges --numstat -M50% --date=iso-strict`

## Run Instructions

### Prerequisites
- Node.js >= 18
- npm >= 9
- Git >= 2.x

### Setup

```bash
# Clone the repo
git clone https://github.com/Jonaphan-Mareno/RAT.git
cd RAT

# Install dependencies
npm install
cd server && npm install && cd ..
cd client && npm install && cd ..

# Build the frontend (for production)
cd client && npx vite build && cd ..

# Start the server (serves API + built frontend)
cd server && node src/index.js
# Open http://localhost:3001
```

### Development Mode

```bash
# Terminal 1: start backend
cd server && node --watch src/index.js

# Terminal 2: start frontend dev server (with proxy to backend)
cd client && npx vite
# Open http://localhost:5173
```

## Supported Features

### Repository Ingestion
- **Clone URL**: Deep clone (full history, no shallow) from any public git URL
- **Zip Upload**: Upload `.zip` containing a `.git` directory; zip-slip protection
- **Local paths**: Clone from local filesystem paths (for testing)
- Background ingestion with progress indicator (SSE)

### Metric Categories

All metrics follow the specification exactly. Binary files are excluded. Merge commits are excluded from H̄.

#### File Metrics (per commit h, per file f)
- `l+(h,f)` — lines added
- `l-(h,f)` — lines removed
- `δ(h,f) = l+(h,f) − l-(h,f)` — growth
- `λ(h,f) = l+(h,f) + l-(h,f)` — churn

#### Directory Metrics (per commit h, per directory d)
- Bottom-up aggregation from immediate children (files and subdirectories)
- `l+(h,d)`, `l-(h,d)`, `δ(h,d)`, `λ(h,d)`

#### Repository Metrics
- Root directory metrics over the filtered commit set

#### Commit Set Metrics (over H, per object o)
- `l+(H,o)`, `l-(H,o)`, `δ(H,o)`, `λ(H,o)` — sums over H
- `n(H,o)` — modification count (commits where `λ(h,o) > 0`)
- `η(H,o) = n(H,o)/|H|` — modification frequency
- `ρ(H,o) = λ(H,o)/|H|` — churn rate

#### Author Metrics
- `n(H,o,a)` — author modification count
- `λ(H,o,a)` — author churn
- `ω(H,o,a) = λ(H,o,a)/λ(H,o)` — author ownership

### Filtering
- **By repository**: switch between multiple ingested repos
- **By author**: dropdown of resolved (merged) author identities
- **By file/directory**: searchable path autocomplete
- **By time period**: from-date (inclusive) and to-date (exclusive) on committer date
- **By manual commit selection**: paginated commit list with checkboxes

### Author Merging
- **Automatic**: `.mailmap` parsed on ingestion; author groups created automatically
- **Manual**: select 2+ authors in the UI, specify canonical name/email, merge

### Multi-Repository
- Sidebar shows all repos with status indicators
- Switch between repos; delete or re-ingest
- State is per-repo

### Visualizations
- **Bar chart**: Top files by churn
- **Treemap**: Directory churn sizes
- **Pie chart**: Author ownership distribution
- **Scatter plot**: Churn vs. modification frequency
- **Sortable tables**: All metric categories with pagination

### QoL Features
- Dark mode toggle
- CSV and JSON export for all metric tables
- Metric formula tooltips (hover any metric header)
- Path search with autocomplete
- Loading skeletons / progress indicators
- Error toasts for all operations
- Empty state handling

## Metric Definitions

| Symbol | Name | Formula |
|--------|------|---------|
| `l+(h,f)` | File Added Lines | Lines added in commit h for file f |
| `l-(h,f)` | File Removed Lines | Lines removed in commit h for file f |
| `δ(h,f)` | File Growth | `l+(h,f) − l-(h,f)` |
| `λ(h,f)` | File Churn | `l+(h,f) + l-(h,f)` |
| `n(H,o)` | Modifications | `Σ I_n(h,o)` where `I_n = 1 if λ(h,o) > 0` |
| `η(H,o)` | Modification Frequency | `n(H,o)/|H|` |
| `ρ(H,o)` | Churn Rate | `λ(H,o)/|H|` |
| `ω(H,o,a)` | Author Ownership | `λ(H,o,a)/λ(H,o)` |

## Verification Results

Cross-validated against git CLI. All metrics match exactly.

### Fixture A: Hand-Computable (3 commits)
| Test | Expected | Actual | Status |
|------|----------|--------|--------|
| C1 A.txt l+ | 2 | 2 | PASS |
| C1 A.txt l- | 0 | 0 | PASS |
| C1 A.txt δ | 2 | 2 | PASS |
| C1 A.txt λ | 2 | 2 | PASS |
| C2 A.txt l+ | 3 | 3 | PASS |
| C2 A.txt l- | 1 | 1 | PASS |
| C3 B.txt l+ | 1 | 1 | PASS |
| H={C1,C2} A.txt l+ | 5 | 5 | PASS |
| H={C1,C2} A.txt l- | 1 | 1 | PASS |
| H={C1,C2} A.txt δ | 4 | 4 | PASS |
| H={C1,C2} A.txt λ | 6 | 6 | PASS |
| H={C1,C2} A.txt n | 2 | 2 | PASS |
| H={C1,C2} A.txt η | 1.0 | 1.0 | PASS |
| H={C1,C2} A.txt ρ | 3.0 | 3.0 | PASS |

### cJSON Cross-Check (955 non-merge commits)
| Metric | git CLI | RAT | Status |
|--------|---------|-----|--------|
| Non-merge commits | 955 | 955 | PASS |
| Total lines added | 46377 | 46377 | PASS |
| Total lines removed | 11211 | 11211 | PASS |
| Total churn | 57588 | 57588 | PASS |

### Time Window Filters (Fixture E)
| Filter | Expected |H|| Actual |H|| Status |
|--------|----------|----------|--------|
| fromDate=June 15 | 2 | 2 | PASS |
| June 1 to July 1 | 2 | 2 | PASS |
| Empty window | 0 | 0 | PASS |

### Edge Cases (Fixture C)
| Test | Expected | Actual | Status |
|------|----------|--------|--------|
| Merge commits excluded | 6 non-merge | 6 | PASS |
| Pure rename (B.txt→B2.txt) | 0 added/removed | 0/0 | PASS |
| Delete (B2.txt) | 0 added, 1 removed | 0/1 | PASS |
| `.mailmap` auto-merge | 1 merged author | 1 | PASS |

## Known Limitations

1. **Reference commit selection**: Currently uses HEAD; the UI does not yet expose selecting an arbitrary reference commit hash (though the API supports it via `commitHashes` filter).
2. **Very large repos** (>50k commits): Ingestion works but UI may be slow for full commit-set metric computation. Indexed SQLite handles queries well, but full-table scans on 50k+ commits can take seconds.
3. **Submodules**: Gitlinks/submodules are ignored (git's default behavior).
4. **Symlinks**: Followed per git's default; no special handling.
5. **Binary detection**: Relies on git's `--numstat` output (`-\t-\t` for binaries).

## AI Declaration

This project was developed with AI assistance (Qoder coding assistant) for implementation. All code, architecture decisions, and metric computations were reviewed and verified against the specification and cross-checked with git CLI output.
