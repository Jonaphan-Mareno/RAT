import { useState, useEffect, useCallback, useSyncExternalStore } from 'react';
import { useParams, useOutletContext } from 'react-router-dom';
import { api, subscribeToStatus, downloadData } from '../api';
import toast from 'react-hot-toast';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, ScatterChart, Scatter, Legend
} from 'recharts';
import {
  ArrowUpDown, Download, Search, ChevronDown, X, Check,
  Circle, Square, Triangle, AlertTriangle, Copy, Filter
} from 'lucide-react';

const CHART_COLORS = ['#1040C0','#D02020','#F0C020','#5C82E8','#0B7A3B','#E24A4A','#B45309','#7C3AED'];

function useChartTheme() {
  const isDark = useSyncExternalStore(
    (cb) => {
      const obs = new MutationObserver(cb);
      obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
      return () => obs.disconnect();
    },
    () => document.documentElement.classList.contains('dark')
  );
  return {
    axisStroke: isDark ? '#F0F0F0' : '#121212',
    gridStroke: isDark ? '#F0F0F020' : '#12121215',
    barStroke: isDark ? '#F0F0F0' : '#121212',
    gridDash: '2 4',
    tickFont: { fontSize: 11, fontFamily: 'Outfit', fill: isDark ? '#F0F0F0' : '#121212' },
  };
}

const MetricTooltip = ({ formula, children }) => (
  <span className="group relative cursor-help">
    {children}
    <span className="invisible group-hover:visible absolute bottom-full left-1/2 -translate-x-1/2 z-50 mb-2
                     bg-bau-surface dark:bg-bau-surface-dark text-bau-ink dark:text-bau-ink-light
                     text-xs font-mono border-2 border-bau-ink dark:border-bau-ink-light
                     shadow-hard-sm dark:shadow-hard-sm-light px-3 py-2 whitespace-nowrap">
      {formula}
    </span>
  </span>
);

/* ── Filter Panel ── */
function FilterPanel({ repoId, filters, setFilters, authors, hSize }) {
  const [files, setFiles] = useState([]);
  const [commits, setCommits] = useState([]);
  const [showCommitSelect, setShowCommitSelect] = useState(false);
  const [commitPage, setCommitPage] = useState(1);
  const [commitTotal, setCommitTotal] = useState(0);
  const [selectedCommits, setSelectedCommits] = useState(new Set());
  const [pathSearch, setPathSearch] = useState('');

  useEffect(() => {
    api.getFiles(repoId).then(setFiles).catch(() => {});
  }, [repoId]);

  const loadCommits = useCallback(async () => {
    try {
      const data = await api.getCommits(repoId, { page: commitPage, limit: 30 });
      setCommits(data.commits);
      setCommitTotal(data.total);
    } catch {}
  }, [repoId, commitPage]);

  useEffect(() => { loadCommits(); }, [loadCommits]);

  const toggleCommit = (hash) => {
    const next = new Set(selectedCommits);
    if (next.has(hash)) next.delete(hash); else next.add(hash);
    setSelectedCommits(next);
  };

  const applyCommitSelection = () => {
    const hashes = Array.from(selectedCommits);
    setFilters(f => ({ ...f, commitHashes: hashes.length > 0 ? hashes.join(',') : undefined }));
    setShowCommitSelect(false);
  };

  const filteredFiles = pathSearch
    ? files.filter(f => f.toLowerCase().includes(pathSearch.toLowerCase())).slice(0, 50)
    : [];

  const activeFilters = Object.entries(filters).filter(([, v]) => v !== undefined);

  return (
    <div className="card p-4 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs font-bold uppercase tracking-[0.2em] flex items-center gap-2">
          <Filter className="w-4 h-4" /> Filters
        </h3>
        {hSize !== undefined && (
          <span className="tag bg-bau-yellow/10 text-bau-ink dark:text-bau-ink-light border-bau-yellow">
            <span className="font-mono font-bold">{hSize?.toLocaleString()}</span> commits matched
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Author */}
        <div>
          <label className="text-[10px] font-bold uppercase tracking-[0.15em] block mb-1.5">Author</label>
          <select
            value={filters.author || ''}
            onChange={(e) => setFilters(f => ({ ...f, author: e.target.value || undefined }))}
            className="input text-sm py-2"
          >
            <option value="">All Authors</option>
            {authors.map((a, i) => (
              <option key={i} value={a.name}>{a.name} ({a.commitCount})</option>
            ))}
          </select>
        </div>

        {/* From Date */}
        <div>
          <label className="text-[10px] font-bold uppercase tracking-[0.15em] block mb-1.5">From Date</label>
          <input
            type="datetime-local"
            value={filters.fromDate?.slice(0, 16) || ''}
            onChange={(e) => setFilters(f => ({ ...f, fromDate: e.target.value ? new Date(e.target.value).toISOString() : undefined }))}
            className="input text-sm py-2"
          />
        </div>

        {/* To Date */}
        <div>
          <label className="text-[10px] font-bold uppercase tracking-[0.15em] block mb-1.5">To Date</label>
          <input
            type="datetime-local"
            value={filters.toDate?.slice(0, 16) || ''}
            onChange={(e) => setFilters(f => ({ ...f, toDate: e.target.value ? new Date(e.target.value).toISOString() : undefined }))}
            className="input text-sm py-2"
          />
        </div>

        {/* Path */}
        <div className="relative">
          <label className="text-[10px] font-bold uppercase tracking-[0.15em] block mb-1.5">File / Directory</label>
          <input
            type="text"
            value={filters.path || pathSearch}
            onChange={(e) => {
              setPathSearch(e.target.value);
              if (!e.target.value) setFilters(f => ({ ...f, path: undefined }));
            }}
            placeholder="Search path..."
            className="input text-sm py-2"
          />
          {filteredFiles.length > 0 && pathSearch && !filters.path && (
            <div className="absolute top-full left-0 right-0 mt-1 z-50
                           bg-bau-surface dark:bg-bau-surface-dark border-2 border-bau-ink dark:border-bau-ink-light
                           shadow-hard dark:shadow-hard-light max-h-40 overflow-y-auto">
              {filteredFiles.map((f, i) => (
                <button key={i} onClick={() => { setFilters(p => ({ ...p, path: f })); setPathSearch(''); }}
                  className="w-full text-left px-3 py-1.5 text-xs font-mono hover:bg-bau-yellow/10 truncate">
                  {f}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Action row */}
      <div className="flex flex-wrap items-center gap-2 mt-4">
        <button onClick={() => setShowCommitSelect(!showCommitSelect)} className="btn-outline btn-sm">
          {filters.commitHashes ? `${filters.commitHashes.split(',').length} Commits` : 'Select Commits'}
        </button>
        <button onClick={() => { setFilters({}); setSelectedCommits(new Set()); setPathSearch(''); }}
          className="btn-ghost btn-sm text-bau-red dark:text-bau-red-dark border-transparent hover:border-bau-red">
          <X className="w-3.5 h-3.5" /> Clear
        </button>

        {/* Active filter chips */}
        {activeFilters.map(([key, val]) => (
          <span key={key} className="tag bg-bau-yellow/10 text-bau-ink dark:text-bau-ink-light border-bau-yellow/50">
            <span className="font-bold">{key}:</span> <span className="font-mono text-[10px] ml-0.5 max-w-[100px] truncate">{String(val).slice(0, 20)}</span>
            <button onClick={() => setFilters(f => { const n = {...f}; delete n[key]; return n; })} className="ml-1 hover:text-bau-red">
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
      </div>

      {/* Commit selection modal */}
      {showCommitSelect && (
        <div className="mt-4 border-2 border-bau-ink dark:border-bau-ink-light p-4 max-h-72 overflow-y-auto">
          <div className="space-y-1">
            {commits.map(c => (
              <label key={c.hash} className="flex items-center gap-3 text-xs cursor-pointer hover:bg-bau-yellow/10 p-2 transition-colors">
                <input type="checkbox" checked={selectedCommits.has(c.hash)} onChange={() => toggleCommit(c.hash)}
                  className="w-4 h-4 accent-bau-blue" />
                <span className="font-mono font-semibold text-bau-blue dark:text-bau-blue-dark">{c.hash.slice(0, 8)}</span>
                <span className="text-bau-ink/60 dark:text-bau-ink-light/60 truncate">{c.author_name}</span>
                <span className="text-bau-ink/40 dark:text-bau-ink-light/40 ml-auto whitespace-nowrap font-mono tabular-nums">
                  {new Date(c.committer_date).toLocaleDateString()}
                </span>
              </label>
            ))}
          </div>
          <div className="flex justify-between items-center mt-3 pt-3 border-t-2 border-bau-ink/20 dark:border-bau-ink-light/20">
            <div className="flex gap-1">
              <button disabled={commitPage <= 1} onClick={() => setCommitPage(p => p - 1)}
                className="btn-outline btn-sm disabled:opacity-30">Prev</button>
              <span className="text-xs font-mono px-2 py-1.5 tabular-nums">{commitPage}</span>
              <button disabled={commitPage * 30 >= commitTotal} onClick={() => setCommitPage(p => p + 1)}
                className="btn-outline btn-sm disabled:opacity-30">Next</button>
            </div>
            <button onClick={applyCommitSelection} className="btn-blue btn-sm">
              <Check className="w-3.5 h-3.5" /> Apply ({selectedCommits.size})
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Stat Card ── */
function StatCard({ label, value, formula, accent }) {
  const accentBar = accent === 'red' ? 'bg-bau-red' : accent === 'blue' ? 'bg-bau-blue' : accent === 'yellow' ? 'bg-bau-yellow' : 'bg-bau-ink dark:bg-bau-ink-light';
  return (
    <div className="card p-3 sm:p-4 relative overflow-hidden">
      <div className={`absolute top-0 left-0 w-1 h-full ${accentBar}`} />
      <MetricTooltip formula={formula}>
        <div className="text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.15em] sm:tracking-[0.2em] text-bau-ink/50 dark:text-bau-ink-light/50 mb-1.5 sm:mb-2 pl-3">
          {label}
        </div>
      </MetricTooltip>
      <div className="text-2xl sm:text-4xl font-black font-mono tabular-nums leading-tight pl-3">
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
    </div>
  );
}

/* ── Data Table ── */
function DataTable({ data, columns, onExport }) {
  const [sortCol, setSortCol] = useState(null);
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  const sorted = [...(data || [])].sort((a, b) => {
    if (!sortCol) return 0;
    const va = a[sortCol], vb = b[sortCol];
    const cmp = typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb));
    return sortDir === 'desc' ? -cmp : cmp;
  });

  const paged = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);

  const handleSort = (key) => {
    if (sortCol === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortCol(key); setSortDir('desc'); }
  };

  return (
    <div>
      {/* Toolbar */}
      <div className="flex justify-between items-center mb-3">
        <span className="text-xs font-bold uppercase tracking-wider text-bau-ink/40 dark:text-bau-ink-light/40">
          {data?.length || 0} rows
        </span>
        {onExport && (
          <div className="flex gap-1">
            <button onClick={() => onExport('csv')} className="btn-outline btn-sm">
              <Download className="w-3.5 h-3.5" /> CSV
            </button>
            <button onClick={() => onExport('json')} className="btn-outline btn-sm">
              <Download className="w-3.5 h-3.5" /> JSON
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto border-2 sm:border-4 border-bau-ink dark:border-bau-ink-light -mx-4 sm:mx-0">
        <table className="table-bauhaus min-w-[600px]">
          <thead>
            <tr>
              {columns.map((col, ci) => (
                <th key={col.key}
                  onClick={() => handleSort(col.key)}
                  role="columnheader"
                  aria-sort={sortCol === col.key ? (sortDir === 'desc' ? 'descending' : 'ascending') : 'none'}
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSort(col.key); }}}
                  className={ci === 0 ? 'sticky left-0 z-10 bg-bau-surface dark:bg-bau-surface-dark' : ''}
                >
                  <span className="flex items-center gap-1">
                    {col.label}
                    <ArrowUpDown className={`w-3 h-3 ${sortCol === col.key ? 'text-bau-yellow' : 'opacity-30'}`} />
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.map((row, i) => (
              <tr key={i}>
                {columns.map((col, ci) => (
                  <td key={col.key} className={`
                    ${typeof row[col.key] === 'number' ? 'text-right font-mono tabular-nums' : ''}
                    whitespace-nowrap
                    ${ci === 0 ? 'sticky left-0 z-10 bg-bau-surface dark:bg-bau-surface-dark' : ''}
                  `}>
                    {col.render ? col.render(row[col.key], row) : (typeof row[col.key] === 'number' ? row[col.key].toLocaleString(undefined, { maximumFractionDigits: 4 }) : row[col.key])}
                  </td>
                ))}
              </tr>
            ))}
            {paged.length === 0 && (
              <tr><td colSpan={columns.length} className="px-3 py-10 text-center text-bau-ink/30 dark:text-bau-ink-light/30 uppercase tracking-wider text-xs font-bold">No data</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-2 mt-4">
          <button disabled={page === 0} onClick={() => setPage(p => p - 1)}
            className="btn-outline btn-sm disabled:opacity-30">Prev</button>
          <span className="text-xs font-mono tabular-nums px-2">{page + 1} / {totalPages}</span>
          <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}
            className="btn-outline btn-sm disabled:opacity-30">Next</button>
        </div>
      )}
    </div>
  );
}

/* ── Chart Frame ── */
function ChartFrame({ title, subtitle, children }) {
  return (
    <div className="card p-5 mt-6" role="figure" aria-label={title}>
      <h3 className="text-sm font-bold uppercase tracking-wider mb-1">{title}</h3>
      {subtitle && <p className="text-[10px] text-bau-ink/40 dark:text-bau-ink-light/40 mb-4">{subtitle}</p>}
      {children}
    </div>
  );
}

/* ── Custom Recharts Tooltip ── */
function BauTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-bau-surface dark:bg-bau-surface-dark border-2 border-bau-ink dark:border-bau-ink-light shadow-hard-sm dark:shadow-hard-sm-light px-3 py-2">
      <p className="text-xs font-bold uppercase mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-xs font-mono tabular-nums" style={{ color: p.color }}>
          {p.name}: {typeof p.value === 'number' ? p.value.toLocaleString() : p.value}
        </p>
      ))}
    </div>
  );
}

/* ════════════ MAIN COMPONENT ════════════ */
export default function RepoView() {
  const { repoId } = useParams();
  const { loadRepos } = useOutletContext();
  const chartTheme = useChartTheme();
  const [repo, setRepo] = useState(null);
  const [tab, setTab] = useState('repository');
  const [filters, setFilters] = useState({});
  const [authors, setAuthors] = useState([]);
  const [loading, setLoading] = useState(false);

  const [repoMetrics, setRepoMetrics] = useState(null);
  const [commitSetData, setCommitSetData] = useState(null);
  const [authorData, setAuthorData] = useState(null);
  const [authorMergeData, setAuthorMergeData] = useState(null);
  const [mergeSelection, setMergeSelection] = useState(new Set());
  const [canonicalName, setCanonicalName] = useState('');
  const [canonicalEmail, setCanonicalEmail] = useState('');

  // Load repo
  useEffect(() => {
    const load = async () => {
      try { setRepo(await api.getRepo(repoId)); } catch {}
    };
    load();
    const interval = setInterval(load, 3000);
    return () => clearInterval(interval);
  }, [repoId]);

  // Load authors
  useEffect(() => {
    if (repo?.status === 'ready') {
      api.getAuthors(repoId).then(d => {
        setAuthors(d.authors || []);
        setAuthorMergeData(d);
      }).catch(() => {});
    }
  }, [repoId, repo?.status]);

  // Load metrics
  useEffect(() => {
    if (repo?.status !== 'ready') return;
    setLoading(true);
    const params = {};
    if (filters.fromDate) params.fromDate = filters.fromDate;
    if (filters.toDate) params.toDate = filters.toDate;
    if (filters.commitHashes) params.commitHashes = filters.commitHashes;
    if (filters.author) params.author = filters.author;
    if (filters.path) params.path = filters.path;

    const load = async () => {
      try {
        if (tab === 'repository') {
          const [repoData, csData] = await Promise.all([
            api.getRepoMetrics(repoId, params),
            api.getCommitSetMetrics(repoId, params),
          ]);
          setRepoMetrics(repoData);
          setCommitSetData(csData);
        } else if (tab === 'files' || tab === 'directories') {
          const data = await api.getCommitSetMetrics(repoId, params);
          setCommitSetData(data);
        } else if (tab === 'commitset') {
          const data = await api.getCommitSetMetrics(repoId, params);
          setCommitSetData(data);
        } else if (tab === 'authors') {
          const data = await api.getAuthorMetrics(repoId, params);
          setAuthorData(data);
        }
      } catch (e) {
        toast.error(e.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [repoId, repo?.status, tab, filters]);

  const handleMerge = async () => {
    if (mergeSelection.size < 2) return toast.error('Select at least 2 authors');
    if (!canonicalName || !canonicalEmail) return toast.error('Enter canonical name and email');
    try {
      const authorsToMerge = Array.from(mergeSelection).map(key => {
        const [name, email] = key.split('|');
        return { name, email };
      });
      await api.mergeAuthors(repoId, { authors: authorsToMerge, canonicalName, canonicalEmail });
      toast.success('Authors merged!');
      setMergeSelection(new Set());
      setCanonicalName('');
      setCanonicalEmail('');
      const d = await api.getAuthors(repoId);
      setAuthors(d.authors || []);
      setAuthorMergeData(d);
    } catch (e) {
      toast.error(e.message);
    }
  };

  const handleUnmerge = async (groupId) => {
    try {
      await api.unmergeAuthors(repoId, groupId);
      toast.success('Author group removed');
      const d = await api.getAuthors(repoId);
      setAuthors(d.authors || []);
      setAuthorMergeData(d);
    } catch (e) {
      toast.error(e.message);
    }
  };

  // Loading skeleton
  if (!repo) return (
    <div className="p-8">
      <div className="h-10 w-64 bg-bau-muted dark:bg-bau-muted-dark animate-pulse mb-4" />
      <div className="h-6 w-48 bg-bau-muted dark:bg-bau-muted-dark animate-pulse" />
    </div>
  );

  // Ingesting state
  if (repo.status !== 'ready') {
    return (
      <div className="p-8 max-w-2xl">
        <h1 className="text-3xl font-black uppercase tracking-tighter mb-6">{repo.name}</h1>
        <div className="panel">
          <div className="flex items-center gap-4">
            <div className="w-8 h-8 border-4 border-bau-blue border-t-transparent rounded-full animate-spin" />
            <div>
              <p className="font-bold uppercase tracking-wider">{repo.status}...</p>
              <p className="text-sm font-mono tabular-nums text-bau-ink/60 dark:text-bau-ink-light/60">
                {Math.round(repo.progress_pct)}% complete
              </p>
            </div>
          </div>
          <div className="w-full bg-bau-muted dark:bg-bau-muted-dark h-3 mt-4 border-2 border-bau-ink dark:border-bau-ink-light">
            <div className="bg-bau-blue h-full transition-all" style={{ width: `${repo.progress_pct}%` }} />
          </div>
          {repo.error_message && (
            <div className="mt-4 border-2 border-bau-red p-3">
              <p className="text-sm text-bau-red dark:text-bau-red-dark flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" /> {repo.error_message}
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  const tabs = [
    { id: 'repository', label: 'Repository' },
    { id: 'files', label: 'Files' },
    { id: 'directories', label: 'Directories' },
    { id: 'commitset', label: 'Commit Set' },
    { id: 'authors', label: 'Authors' },
    { id: 'merge', label: 'Author Merge' },
  ];

  const fileColumns = [
    { key: 'path', label: 'Path', render: v => <span className="font-mono text-xs font-semibold">{v}</span> },
    { key: 'added', label: 'Added' },
    { key: 'removed', label: 'Removed' },
    { key: 'growth', label: 'Growth' },
    { key: 'churn', label: 'Churn' },
    { key: 'modifications', label: 'Modifications' },
    { key: 'modificationFreq', label: 'Mod. Freq.' },
    { key: 'churnRate', label: 'Churn Rate' },
  ];

  const currentHSize = repoMetrics?.H_size ?? commitSetData?.H_size ?? authorData?.H_size;

  return (
    <div className="p-4 sm:p-6 md:p-8">
      {/* Header */}
      <div className="mb-6">
        <div className="text-xs font-bold uppercase tracking-[0.2em] text-bau-ink/40 dark:text-bau-ink-light/40 mb-2">
          Repos / {repo.name}
        </div>
        <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tighter leading-tight">
          {repo.name}
        </h1>
        <div className="flex items-center gap-4 mt-2 text-sm">
          <span className="tag bg-bau-blue/10 text-bau-blue dark:text-bau-blue-dark border-bau-blue">
            Commits <span className="font-mono font-bold ml-1 tabular-nums">{repo.commit_count?.toLocaleString()}</span>
          </span>
          <span className="font-mono text-xs text-bau-ink/40 dark:text-bau-ink-light/40 tabular-nums flex items-center gap-1">
            REF {repo.ref_commit?.slice(0, 10)}
            <button
              onClick={() => { navigator.clipboard.writeText(repo.ref_commit || ''); toast.success('Copied!'); }}
              className="hover:text-bau-ink dark:hover:text-bau-ink-light transition-colors"
              title="Copy full hash"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
          </span>
        </div>
      </div>

      <FilterPanel repoId={repoId} filters={filters} setFilters={setFilters} authors={authors} hSize={currentHSize} />

      {/* Tabs */}
      <div className="flex gap-0 mb-6 border-b-4 border-bau-ink dark:border-bau-ink-light overflow-x-auto scrollbar-hide -mx-4 sm:mx-0 px-4 sm:px-0">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-3 sm:px-5 py-2.5 sm:py-3 text-[10px] sm:text-xs font-bold uppercase tracking-wider whitespace-nowrap transition-all border-b-4 -mb-[4px] flex-shrink-0
              ${tab === t.id
                ? 'bg-bau-yellow text-bau-ink border-bau-yellow'
                : 'border-transparent text-bau-ink/40 dark:text-bau-ink-light/40 hover:text-bau-ink dark:hover:text-bau-ink-light hover:border-bau-ink/20'
              }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center gap-3 mb-6">
          <div className="w-5 h-5 border-4 border-bau-blue border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-bold uppercase tracking-wider text-bau-ink/40 dark:text-bau-ink-light/40">Loading metrics...</span>
        </div>
      )}

      {/* ═══ Repository Tab ═══ */}
      {tab === 'repository' && repoMetrics && (
        <div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
            <StatCard label="Lines Added" value={repoMetrics.added || 0} formula="l+(H, root) = Σ added lines" accent="blue" />
            <StatCard label="Lines Removed" value={repoMetrics.removed || 0} formula="l-(H, root) = Σ removed lines" accent="red" />
            <StatCard label="Growth" value={repoMetrics.growth || 0} formula="δ(H, root) = l+ − l-" accent="blue" />
            <StatCard label="Churn" value={repoMetrics.churn || 0} formula="λ(H, root) = l+ + l-" accent="yellow" />
            <StatCard label="Commits" value={repoMetrics.H_size || 0} formula="|H| = size of filtered commit set" />
            <StatCard label="Files" value={repoMetrics.fileCount || 0} formula="H[F] = union of files across commit set" />
            <StatCard label="Directories" value={repoMetrics.dirCount || 0} formula="H[D] = union of directories across commit set" />
            <StatCard label="Churn Rate" value={(repoMetrics.churnRate || 0).toFixed(2)} formula="ρ = λ / |H| (churn per commit)" accent="yellow" />
          </div>

          {commitSetData?.files && (
            <ChartFrame title="Top Files by Churn" subtitle="λ(H, f) — highest file churn in the filtered commit set">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={(commitSetData?.files || []).sort((a, b) => b.churn - a.churn).slice(0, 15)}>
                  <CartesianGrid stroke={chartTheme.gridStroke} strokeDasharray={chartTheme.gridDash} />
                  <XAxis dataKey="path" tick={chartTheme.tickFont} angle={-30} textAnchor="end" height={80}
                    tickFormatter={v => v.split('/').pop()} stroke={chartTheme.axisStroke} strokeWidth={2} />
                  <YAxis tick={chartTheme.tickFont} stroke={chartTheme.axisStroke} strokeWidth={2} />
                  <Tooltip content={<BauTooltip />} />
                  <Bar dataKey="churn" fill={CHART_COLORS[0]} name="Churn (λ)" stroke={chartTheme.barStroke} strokeWidth={2} />
                </BarChart>
              </ResponsiveContainer>
            </ChartFrame>
          )}
        </div>
      )}

      {/* ═══ Files Tab ═══ */}
      {tab === 'files' && commitSetData && (
        <DataTable
          data={commitSetData.files}
          columns={fileColumns}
          onExport={(type) => downloadData(commitSetData.files, `files.${type}`, type)}
        />
      )}

      {/* ═══ Directories Tab ═══ */}
      {tab === 'directories' && commitSetData && (
        <div>
          {commitSetData.directories?.length > 0 && (
            <ChartFrame title="Directory Churn" subtitle="Top directories ranked by λ(H, d) — total churn">
              <div className="space-y-1.5">
                {(() => {
                  const dirs = commitSetData.directories
                    .filter(d => d.churn > 0 && d.path !== '/')
                    .sort((a, b) => b.churn - a.churn)
                    .slice(0, 20);
                  const maxChurn = dirs[0]?.churn || 1;
                  return dirs.map((d, i) => {
                    const pct = (d.churn / maxChurn) * 100;
                    const color = CHART_COLORS[i % CHART_COLORS.length];
                    const shortName = d.path.split('/').pop() || d.path;
                    return (
                      <div key={d.path} className="flex items-center gap-3" title={`${d.path} — λ=${d.churn.toLocaleString()}`}>
                        <span className="w-36 md:w-48 text-xs font-mono truncate text-right flex-shrink-0"
                              title={d.path}>
                          {d.path}
                        </span>
                        <div className="flex-1 h-7 bg-bau-muted/30 dark:bg-bau-muted-dark/50 border border-bau-ink/10 dark:border-bau-ink-light/10 relative overflow-hidden">
                          <div
                            className="h-full border-r-2 border-bau-ink dark:border-bau-ink-light transition-all duration-300 flex items-center"
                            style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: color }}
                          >
                            {pct > 25 && (
                              <span className="px-2 text-[10px] font-bold text-white uppercase tracking-wider truncate">
                                {shortName}
                              </span>
                            )}
                          </div>
                        </div>
                        <span className="w-20 text-xs font-mono tabular-nums text-right flex-shrink-0 font-bold">
                          {d.churn.toLocaleString()}
                        </span>
                      </div>
                    );
                  });
                })()}
              </div>
            </ChartFrame>
          )}
          <div className="mt-6">
            <DataTable
              data={commitSetData.directories}
              columns={[
                { key: 'path', label: 'Directory', render: v => <span className="font-mono text-xs font-semibold">{v || '/'}</span> },
                { key: 'added', label: 'Added' },
                { key: 'removed', label: 'Removed' },
                { key: 'growth', label: 'Growth' },
                { key: 'churn', label: 'Churn' },
                { key: 'modifications', label: 'Modifications' },
                { key: 'modificationFreq', label: 'Mod. Freq.' },
                { key: 'churnRate', label: 'Churn Rate' },
              ]}
              onExport={(type) => downloadData(commitSetData.directories, `directories.${type}`, type)}
            />
          </div>
        </div>
      )}

      {/* ═══ Commit Set Tab ═══ */}
      {tab === 'commitset' && commitSetData && (
        <div>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-6">
            <StatCard label="Commits" value={commitSetData.H_size} formula="|H| = size of filtered commit set" />
            <StatCard label="Files" value={commitSetData.files?.length || 0} formula="H[F] = union of file paths across all commits" accent="blue" />
            <StatCard label="Directories" value={commitSetData.directories?.length || 0} formula="H[D] = union of directory paths across all commits" />
          </div>
          <DataTable
            data={commitSetData.files}
            columns={fileColumns}
            onExport={(type) => downloadData(commitSetData.files, `commitset.${type}`, type)}
          />
          {commitSetData.files?.length > 0 && (
            <ChartFrame title="Churn vs Modifications" subtitle="Files with high churn and many modifications are hotspots">
              <ResponsiveContainer width="100%" height={300}>
                <ScatterChart>
                  <CartesianGrid stroke={chartTheme.gridStroke} strokeDasharray={chartTheme.gridDash} />
                  <XAxis dataKey="modifications" name="Modifications" tick={chartTheme.tickFont} stroke={chartTheme.axisStroke} strokeWidth={2} />
                  <YAxis dataKey="churn" name="Churn" tick={chartTheme.tickFont} stroke={chartTheme.axisStroke} strokeWidth={2} />
                  <Tooltip content={<BauTooltip />} />
                  <Scatter data={commitSetData.files.slice(0, 200)} fill={CHART_COLORS[0]} shape="square" />
                </ScatterChart>
              </ResponsiveContainer>
            </ChartFrame>
          )}
        </div>
      )}

      {/* ═══ Authors Tab ═══ */}
      {tab === 'authors' && authorData && (
        <div>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-6">
            <StatCard label="Commits" value={authorData.H_size} formula="|H| = size of filtered commit set" />
            <StatCard label="Authors" value={authorData.authors?.length || 0} formula="Unique authors after identity merging" accent="blue" />
          </div>
          <DataTable
            data={authorData.authors}
            columns={[
              { key: 'name', label: 'Author', render: v => <span className="font-bold">{v}</span> },
              { key: 'email', label: 'Email', render: v => <span className="font-mono text-xs">{v}</span> },
              { key: 'commitCount', label: 'Commits' },
              { key: 'totalChurn', label: 'Churn' },
              { key: 'totalModifications', label: 'Modifications' },
              { key: 'overallOwnership', label: 'Ownership' },
            ]}
            onExport={(type) => downloadData(authorData.authors, `authors.${type}`, type)}
          />
          {authorData.authors?.length > 0 && (
            <ChartFrame title="Ownership Distribution" subtitle="Each author's share of total code churn">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={authorData.authors.slice(0, 10)} layout="vertical">
                  <CartesianGrid stroke={chartTheme.gridStroke} strokeDasharray={chartTheme.gridDash} />
                  <XAxis type="number" tick={chartTheme.tickFont} stroke={chartTheme.axisStroke} strokeWidth={2}
                    tickFormatter={v => `${(v * 100).toFixed(0)}%`} />
                  <YAxis type="category" dataKey="name" tick={chartTheme.tickFont} width={120} stroke={chartTheme.axisStroke} strokeWidth={2}
                    tickFormatter={v => v.length > 15 ? v.slice(0, 15) + '…' : v} />
                  <Tooltip formatter={v => `${(v * 100).toFixed(1)}%`} content={<BauTooltip />} />
                  <Bar dataKey="overallOwnership" name="Ownership (ω)" stroke={chartTheme.barStroke} strokeWidth={2}>
                    {authorData.authors.slice(0, 10).map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartFrame>
          )}
        </div>
      )}

      {/* ═══ Author Merge Tab ═══ */}
      {tab === 'merge' && (
        <div className="space-y-6">
          <div className="panel">
            <h3 className="text-lg font-bold uppercase tracking-wider mb-2">Manual Author Merge</h3>
            <p className="text-xs text-bau-ink/50 dark:text-bau-ink-light/50 mb-4">
              Select 2+ author identities to merge into a single canonical author.
            </p>
            <div className="space-y-1 max-h-72 overflow-y-auto mb-4 border-2 border-bau-ink/20 dark:border-bau-ink-light/20">
              {authors.map((a, i) => {
                const key = `${a.name}|${a.email}`;
                const selected = mergeSelection.has(key);
                return (
                  <label key={i} className={`flex items-center gap-3 text-sm cursor-pointer p-3 transition-colors
                    ${selected ? 'bg-bau-yellow/10' : 'hover:bg-bau-canvas dark:hover:bg-bau-muted-dark/50'}`}>
                    <input type="checkbox" checked={selected}
                      className="w-4 h-4 accent-bau-blue"
                      onChange={() => {
                        const next = new Set(mergeSelection);
                        if (next.has(key)) next.delete(key); else next.add(key);
                        setMergeSelection(next);
                        if (!canonicalName && !next.has(key)) return;
                        const first = Array.from(next)[0]?.split('|');
                        if (first) { setCanonicalName(first[0]); setCanonicalEmail(first[1]); }
                      }} />
                    <span className="font-bold">{a.name}</span>
                    <span className="text-bau-ink/40 dark:text-bau-ink-light/40 text-xs font-mono">&lt;{a.email}&gt;</span>
                    <span className="text-bau-ink/30 dark:text-bau-ink-light/30 text-xs font-mono ml-auto tabular-nums">{a.commitCount} commits</span>
                  </label>
                );
              })}
            </div>

            {mergeSelection.size >= 2 && (
              <div className="border-t-4 border-bau-ink dark:border-bau-ink-light pt-4 space-y-3">
                <p className="text-xs font-bold uppercase tracking-wider text-bau-ink/60 dark:text-bau-ink-light/60">
                  Will become: {canonicalName} ({mergeSelection.size} identities)
                </p>
                <input type="text" value={canonicalName} onChange={(e) => setCanonicalName(e.target.value)}
                  placeholder="Canonical name" className="input" />
                <input type="text" value={canonicalEmail} onChange={(e) => setCanonicalEmail(e.target.value)}
                  placeholder="Canonical email" className="input font-mono" />
                <button onClick={handleMerge} className="btn-red">
                  Merge {mergeSelection.size} Authors
                </button>
              </div>
            )}
          </div>

          {/* Existing groups */}
          {authorMergeData?.groups?.length > 0 && (
            <div className="panel">
              <h3 className="text-lg font-bold uppercase tracking-wider mb-4">Existing Merge Groups</h3>
              <div className="space-y-3">
                {authorMergeData.groups.map(g => (
                  <div key={g.id} className="card p-4 flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-bold">{g.canonicalName}</span>
                        <span className="font-mono text-xs text-bau-ink/40 dark:text-bau-ink-light/40">&lt;{g.canonicalEmail}&gt;</span>
                        <span className={`tag text-[9px] ${g.source === 'mailmap' ? 'bg-bau-blue/10 text-bau-blue border-bau-blue' : 'bg-bau-yellow/10 text-bau-warn border-bau-warn'}`}>
                          {g.source}
                        </span>
                      </div>
                      <div className="text-xs text-bau-ink/40 dark:text-bau-ink-light/40 font-mono">
                        {g.aliases.map(a => `${a.name} <${a.email}>`).join(' · ')}
                      </div>
                    </div>
                    <button onClick={() => handleUnmerge(g.id)} className="btn-outline btn-sm text-bau-red border-bau-red hover:bg-bau-red hover:text-white">
                      Unmerge
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
