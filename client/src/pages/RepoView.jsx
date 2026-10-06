import { useState, useEffect, useCallback } from 'react';
import { useParams, useOutletContext } from 'react-router-dom';
import { api, subscribeToStatus, downloadData } from '../api';
import toast from 'react-hot-toast';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, ScatterChart, Scatter, Treemap, Legend, LineChart, Line
} from 'recharts';

const COLORS = ['#6366f1','#f59e0b','#10b981','#ef4444','#8b5cf6','#ec4899','#14b8a6','#f97316','#06b6d4','#84cc16'];

const MetricTooltip = ({ formula, children }) => (
  <span className="group relative cursor-help">
    {children}
    <span className="invisible group-hover:visible absolute bottom-full left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap z-50 mb-1">
      {formula}
    </span>
  </span>
);

function FilterPanel({ repoId, filters, setFilters, authors }) {
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

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-4">
      <h3 className="text-sm font-semibold mb-3 dark:text-white">Filters</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Author filter */}
        <div>
          <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Author</label>
          <select
            value={filters.author || ''}
            onChange={(e) => setFilters(f => ({ ...f, author: e.target.value || undefined }))}
            className="w-full px-3 py-1.5 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          >
            <option value="">All Authors</option>
            {authors.map((a, i) => (
              <option key={i} value={a.name}>{a.name} ({a.commitCount})</option>
            ))}
          </select>
        </div>

        {/* Date range */}
        <div>
          <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">From Date</label>
          <input
            type="datetime-local"
            value={filters.fromDate?.slice(0, 16) || ''}
            onChange={(e) => setFilters(f => ({ ...f, fromDate: e.target.value ? new Date(e.target.value).toISOString() : undefined }))}
            className="w-full px-3 py-1.5 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">To Date</label>
          <input
            type="datetime-local"
            value={filters.toDate?.slice(0, 16) || ''}
            onChange={(e) => setFilters(f => ({ ...f, toDate: e.target.value ? new Date(e.target.value).toISOString() : undefined }))}
            className="w-full px-3 py-1.5 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          />
        </div>

        {/* Path search */}
        <div className="relative">
          <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">File/Directory</label>
          <input
            type="text"
            value={filters.path || pathSearch}
            onChange={(e) => {
              setPathSearch(e.target.value);
              if (!e.target.value) setFilters(f => ({ ...f, path: undefined }));
            }}
            placeholder="Search path..."
            className="w-full px-3 py-1.5 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          />
          {filteredFiles.length > 0 && pathSearch && !filters.path && (
            <div className="absolute top-full left-0 right-0 bg-white dark:bg-gray-800 border dark:border-gray-600 rounded-lg shadow-lg max-h-40 overflow-y-auto z-50 mt-1">
              {filteredFiles.map((f, i) => (
                <button key={i} onClick={() => { setFilters(p => ({ ...p, path: f })); setPathSearch(''); }}
                  className="w-full text-left px-3 py-1 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 truncate dark:text-gray-300">
                  {f}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-2 mt-3">
        <button onClick={() => setShowCommitSelect(!showCommitSelect)}
          className="px-3 py-1 text-xs border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 dark:border-gray-600 dark:text-gray-300">
          {filters.commitHashes ? `${filters.commitHashes.split(',').length} commits selected` : 'Select Commits'}
        </button>
        <button onClick={() => { setFilters({}); setSelectedCommits(new Set()); setPathSearch(''); }}
          className="px-3 py-1 text-xs text-red-500 border border-red-200 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 dark:border-red-800">
          Clear Filters
        </button>
      </div>

      {showCommitSelect && (
        <div className="mt-3 border dark:border-gray-600 rounded-lg p-3 max-h-64 overflow-y-auto">
          <div className="space-y-1">
            {commits.map(c => (
              <label key={c.hash} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 p-1 rounded">
                <input type="checkbox" checked={selectedCommits.has(c.hash)} onChange={() => toggleCommit(c.hash)}
                  className="rounded" />
                <span className="font-mono text-indigo-600 dark:text-indigo-400">{c.hash.slice(0, 8)}</span>
                <span className="text-gray-500 dark:text-gray-400 truncate">{c.author_name}</span>
                <span className="text-gray-400 ml-auto whitespace-nowrap">{new Date(c.committer_date).toLocaleDateString()}</span>
              </label>
            ))}
          </div>
          <div className="flex justify-between items-center mt-2 pt-2 border-t dark:border-gray-600">
            <div className="flex gap-1">
              <button disabled={commitPage <= 1} onClick={() => setCommitPage(p => p - 1)}
                className="px-2 py-0.5 text-xs border rounded disabled:opacity-30 dark:border-gray-600 dark:text-gray-300">Prev</button>
              <button disabled={commitPage * 30 >= commitTotal} onClick={() => setCommitPage(p => p + 1)}
                className="px-2 py-0.5 text-xs border rounded disabled:opacity-30 dark:border-gray-600 dark:text-gray-300">Next</button>
            </div>
            <button onClick={applyCommitSelection}
              className="px-3 py-1 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
              Apply ({selectedCommits.size} selected)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value, formula }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
      <MetricTooltip formula={formula}>
        <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</div>
      </MetricTooltip>
      <div className="text-2xl font-bold dark:text-white">{typeof value === 'number' ? value.toLocaleString() : value}</div>
    </div>
  );
}

function SortableTable({ data, columns, onExport }) {
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

  return (
    <div>
      <div className="flex justify-between items-center mb-2">
        <span className="text-xs text-gray-400">{data?.length || 0} rows</span>
        {onExport && (
          <div className="flex gap-1">
            <button onClick={() => onExport('csv')} className="px-2 py-0.5 text-xs border rounded hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300">CSV</button>
            <button onClick={() => onExport('json')} className="px-2 py-0.5 text-xs border rounded hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300">JSON</button>
          </div>
        )}
      </div>
      <div className="overflow-x-auto rounded-lg border dark:border-gray-700">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              {columns.map(col => (
                <th key={col.key} onClick={() => { setSortCol(col.key); setSortDir(d => d === 'desc' ? 'asc' : 'desc'); }}
                  className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 whitespace-nowrap">
                  {col.label} {sortCol === col.key && (sortDir === 'desc' ? ' ↓' : ' ↑')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y dark:divide-gray-700">
            {paged.map((row, i) => (
              <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                {columns.map(col => (
                  <td key={col.key} className="px-3 py-2 dark:text-gray-300 whitespace-nowrap">
                    {col.render ? col.render(row[col.key], row) : (typeof row[col.key] === 'number' ? row[col.key].toLocaleString(undefined, { maximumFractionDigits: 4 }) : row[col.key])}
                  </td>
                ))}
              </tr>
            ))}
            {paged.length === 0 && (
              <tr><td colSpan={columns.length} className="px-3 py-8 text-center text-gray-400">No data</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex justify-center gap-1 mt-2">
          <button disabled={page === 0} onClick={() => setPage(p => p - 1)}
            className="px-2 py-0.5 text-xs border rounded disabled:opacity-30 dark:border-gray-600 dark:text-gray-300">Prev</button>
          <span className="text-xs text-gray-400 px-2 py-0.5">{page + 1}/{totalPages}</span>
          <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}
            className="px-2 py-0.5 text-xs border rounded disabled:opacity-30 dark:border-gray-600 dark:text-gray-300">Next</button>
        </div>
      )}
    </div>
  );
}

export default function RepoView() {
  const { repoId } = useParams();
  const { loadRepos } = useOutletContext();
  const [repo, setRepo] = useState(null);
  const [tab, setTab] = useState('repository');
  const [filters, setFilters] = useState({});
  const [authors, setAuthors] = useState([]);
  const [loading, setLoading] = useState(false);

  // Metric data
  const [repoMetrics, setRepoMetrics] = useState(null);
  const [commitSetData, setCommitSetData] = useState(null);
  const [authorData, setAuthorData] = useState(null);
  const [authorMergeData, setAuthorMergeData] = useState(null);
  const [showMergeUI, setShowMergeUI] = useState(false);
  const [mergeSelection, setMergeSelection] = useState(new Set());
  const [canonicalName, setCanonicalName] = useState('');
  const [canonicalEmail, setCanonicalEmail] = useState('');

  // Load repo
  useEffect(() => {
    const load = async () => {
      try {
        const data = await api.getRepo(repoId);
        setRepo(data);
      } catch { }
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

  // Load metrics based on tab and filters
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
          const data = await api.getRepoMetrics(repoId, params);
          setRepoMetrics(data);
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
      // Reload
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

  if (!repo) return <div className="p-8"><div className="animate-pulse h-8 bg-gray-200 dark:bg-gray-700 rounded w-48" /></div>;

  if (repo.status !== 'ready') {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold mb-4 dark:text-white">{repo.name}</h1>
        <div className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 p-6">
          <div className="flex items-center gap-3">
            <div className="animate-spin h-6 w-6 border-2 border-indigo-600 border-t-transparent rounded-full" />
            <div>
              <p className="font-medium dark:text-white capitalize">{repo.status}...</p>
              <p className="text-sm text-gray-500">{Math.round(repo.progress_pct)}% complete</p>
            </div>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 mt-4">
            <div className="bg-indigo-600 h-3 rounded-full transition-all" style={{ width: `${repo.progress_pct}%` }} />
          </div>
          {repo.error_message && <p className="text-red-500 text-sm mt-3">{repo.error_message}</p>}
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
    { key: 'path', label: 'Path', render: v => <span className="font-mono text-xs">{v}</span> },
    { key: 'added', label: 'l+(H,o)' },
    { key: 'removed', label: 'l-(H,o)' },
    { key: 'growth', label: 'δ(H,o)' },
    { key: 'churn', label: 'λ(H,o)' },
    { key: 'modifications', label: 'n(H,o)' },
    { key: 'modificationFreq', label: 'η(H,o)' },
    { key: 'churnRate', label: 'ρ(H,o)' },
  ];

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold dark:text-white">{repo.name}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {repo.commit_count} commits | ref: <span className="font-mono">{repo.ref_commit?.slice(0, 10)}</span>
          </p>
        </div>
      </div>

      <FilterPanel repoId={repoId} filters={filters} setFilters={setFilters} authors={authors} />

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b dark:border-gray-700 overflow-x-auto">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              tab === t.id
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center gap-2 mb-4">
          <div className="animate-spin h-4 w-4 border-2 border-indigo-600 border-t-transparent rounded-full" />
          <span className="text-sm text-gray-500">Loading metrics...</span>
        </div>
      )}

      {/* Repository Tab */}
      {tab === 'repository' && repoMetrics && (
        <div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <MetricCard label="Lines Added" value={repoMetrics.added || 0} formula="l+(H, root) = Σ added lines" />
            <MetricCard label="Lines Removed" value={repoMetrics.removed || 0} formula="l-(H, root) = Σ removed lines" />
            <MetricCard label="Growth" value={repoMetrics.growth || 0} formula="δ(H, root) = l+ - l-" />
            <MetricCard label="Churn" value={repoMetrics.churn || 0} formula="λ(H, root) = l+ + l-" />
            <MetricCard label="Commits (|H|)" value={repoMetrics.H_size || 0} formula="|H| = size of filtered commit set" />
            <MetricCard label="Files" value={repoMetrics.fileCount || 0} formula="Unique files in H[F]" />
            <MetricCard label="Directories" value={repoMetrics.dirCount || 0} formula="Unique dirs in H[D]" />
            <MetricCard label="Churn Rate" value={(repoMetrics.churnRate || 0).toFixed(2)} formula="ρ(H, root) = λ/|H|" />
          </div>
          {/* Timeline Chart */}
          {commitSetData?.files && (
            <div className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 p-4">
              <h3 className="text-sm font-semibold mb-3 dark:text-white">Top Files by Churn</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={(commitSetData?.files || []).sort((a, b) => b.churn - a.churn).slice(0, 15)}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="path" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" height={80}
                    tickFormatter={v => v.split('/').pop()} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="churn" fill="#6366f1" name="Churn (λ)" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* Files Tab */}
      {tab === 'files' && commitSetData && (
        <div>
          <SortableTable
            data={commitSetData.files}
            columns={fileColumns}
            onExport={(type) => downloadData(commitSetData.files, `files.${type}`, type)}
          />
        </div>
      )}

      {/* Directories Tab */}
      {tab === 'directories' && commitSetData && (
        <div>
          <SortableTable
            data={commitSetData.directories}
            columns={[
              { key: 'path', label: 'Directory', render: v => <span className="font-mono text-xs">{v}</span> },
              { key: 'added', label: 'l+(H,d)' },
              { key: 'removed', label: 'l-(H,d)' },
              { key: 'growth', label: 'δ(H,d)' },
              { key: 'churn', label: 'λ(H,d)' },
              { key: 'modifications', label: 'n(H,d)' },
              { key: 'modificationFreq', label: 'η(H,d)' },
              { key: 'churnRate', label: 'ρ(H,d)' },
            ]}
            onExport={(type) => downloadData(commitSetData.directories, `directories.${type}`, type)}
          />
          {/* Treemap of churn */}
          {commitSetData.directories?.length > 0 && (
            <div className="mt-6 bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 p-4">
              <h3 className="text-sm font-semibold mb-3 dark:text-white">Directory Churn Treemap</h3>
              <ResponsiveContainer width="100%" height={300}>
                <Treemap
                  data={commitSetData.directories.filter(d => d.churn > 0 && d.path !== '/').slice(0, 30).map(d => ({
                    name: d.path, size: d.churn
                  }))}
                  dataKey="size"
                  nameKey="name"
                  stroke="#fff"
                  fill="#6366f1"
                >
                  <Tooltip formatter={(v) => v.toLocaleString()} />
                </Treemap>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* Commit Set Tab */}
      {tab === 'commitset' && commitSetData && (
        <div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <MetricCard label="|H|" value={commitSetData.H_size} formula="Size of filtered commit set" />
            <MetricCard label="Files in H[F]" value={commitSetData.files?.length || 0} formula="Union of files across H" />
            <MetricCard label="Dirs in H[D]" value={commitSetData.directories?.length || 0} formula="Union of dirs across H" />
          </div>
          <SortableTable
            data={commitSetData.files}
            columns={fileColumns}
            onExport={(type) => downloadData(commitSetData.files, `commitset.${type}`, type)}
          />
          {/* Scatter plot */}
          {commitSetData.files?.length > 0 && (
            <div className="mt-6 bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 p-4">
              <h3 className="text-sm font-semibold mb-3 dark:text-white">Churn vs Modifications</h3>
              <ResponsiveContainer width="100%" height={300}>
                <ScatterChart>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="modifications" name="Modifications" tick={{ fontSize: 11 }} />
                  <YAxis dataKey="churn" name="Churn" tick={{ fontSize: 11 }} />
                  <Tooltip cursor={{ strokeDasharray: '3 3' }}
                    formatter={(v, name) => [v.toLocaleString(), name]}
                    labelFormatter={() => ''} />
                  <Scatter data={commitSetData.files.slice(0, 200)} fill="#6366f1" />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* Authors Tab */}
      {tab === 'authors' && authorData && (
        <div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
            <MetricCard label="|H|" value={authorData.H_size} formula="Commit set size" />
            <MetricCard label="Authors" value={authorData.authors?.length || 0} formula="Unique authors after merging" />
          </div>
          <SortableTable
            data={authorData.authors}
            columns={[
              { key: 'name', label: 'Author' },
              { key: 'email', label: 'Email', render: v => <span className="text-xs">{v}</span> },
              { key: 'commitCount', label: 'Commits' },
              { key: 'totalChurn', label: 'λ(H,*,a)' },
              { key: 'totalModifications', label: 'n(H,*,a)' },
              { key: 'overallOwnership', label: 'ω(H,*,a)' },
            ]}
            onExport={(type) => downloadData(authorData.authors, `authors.${type}`, type)}
          />
          {/* Ownership Pie */}
          {authorData.authors?.length > 0 && (
            <div className="mt-6 bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 p-4">
              <h3 className="text-sm font-semibold mb-3 dark:text-white">Ownership Distribution</h3>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={authorData.authors.slice(0, 10)} dataKey="overallOwnership" nameKey="name"
                    cx="50%" cy="50%" outerRadius={100} label={({ name, percent }) => `${name.split(' ')[0]} ${(percent * 100).toFixed(0)}%`}>
                    {authorData.authors.slice(0, 10).map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => `${(v * 100).toFixed(1)}%`} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* Author Merge Tab */}
      {tab === 'merge' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 p-4">
            <h3 className="text-sm font-semibold mb-3 dark:text-white">Manual Author Merge</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              Select 2+ author identities to merge into a single canonical author.
            </p>
            <div className="space-y-1 max-h-64 overflow-y-auto mb-3">
              {authors.map((a, i) => {
                const key = `${a.name}|${a.email}`;
                return (
                  <label key={i} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 p-2 rounded">
                    <input type="checkbox" checked={mergeSelection.has(key)}
                      onChange={() => {
                        const next = new Set(mergeSelection);
                        if (next.has(key)) next.delete(key); else next.add(key);
                        setMergeSelection(next);
                        if (!canonicalName && !next.has(key)) return;
                        const first = Array.from(next)[0]?.split('|');
                        if (first) { setCanonicalName(first[0]); setCanonicalEmail(first[1]); }
                      }} />
                    <span className="dark:text-gray-200">{a.name}</span>
                    <span className="text-gray-400 text-xs">&lt;{a.email}&gt;</span>
                    <span className="text-gray-400 text-xs ml-auto">{a.commitCount} commits</span>
                  </label>
                );
              })}
            </div>
            {mergeSelection.size >= 2 && (
              <div className="border-t dark:border-gray-600 pt-3 space-y-2">
                <input type="text" value={canonicalName} onChange={(e) => setCanonicalName(e.target.value)}
                  placeholder="Canonical name" className="w-full px-3 py-1.5 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                <input type="text" value={canonicalEmail} onChange={(e) => setCanonicalEmail(e.target.value)}
                  placeholder="Canonical email" className="w-full px-3 py-1.5 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                <button onClick={handleMerge}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700">
                  Merge {mergeSelection.size} Authors
                </button>
              </div>
            )}
          </div>

          {/* Existing Groups */}
          {authorMergeData?.groups?.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 p-4">
              <h3 className="text-sm font-semibold mb-3 dark:text-white">Existing Merge Groups</h3>
              <div className="space-y-2">
                {authorMergeData.groups.map(g => (
                  <div key={g.id} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded">
                    <div>
                      <span className="text-sm font-medium dark:text-white">{g.canonicalName} &lt;{g.canonicalEmail}&gt;</span>
                      <span className="text-xs text-gray-400 ml-2">({g.source})</span>
                      <div className="text-xs text-gray-400 mt-0.5">
                        Aliases: {g.aliases.map(a => `${a.name} <${a.email}>`).join(', ')}
                      </div>
                    </div>
                    <button onClick={() => handleUnmerge(g.id)}
                      className="text-xs text-red-500 hover:text-red-700">Remove</button>
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
