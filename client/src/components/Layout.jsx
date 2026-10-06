import { useState, useEffect } from 'react';
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { api } from '../api';
import toast from 'react-hot-toast';
import {
  Trash2, Sun, Moon, Menu, X, GitBranch, Home, ChevronRight
} from 'lucide-react';

function StatusDot({ status }) {
  const base = 'w-2.5 h-2.5 flex-shrink-0';
  if (status === 'ready') return <span className={`${base} rounded-full bg-bau-success`} title="Ready" />;
  if (status === 'ingesting') return <span className={`${base} bg-bau-yellow animate-pulse`} title="Ingesting" />;
  if (status === 'error') return <span className={`${base} rounded-full bg-bau-red`} title="Error" style={{ clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)' }} />;
  return <span className={`${base} rounded-full border-2 border-bau-ink-light/30`} title="Pending" />;
}

export default function Layout() {
  const [repos, setRepos] = useState([]);
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('darkMode') === 'true');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    localStorage.setItem('darkMode', darkMode);
  }, [darkMode]);

  const loadRepos = async () => {
    try { setRepos(await api.getRepos()); } catch (e) { console.error(e); }
  };

  useEffect(() => {
    loadRepos();
    const interval = setInterval(loadRepos, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleDelete = async (id, e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm('Delete this repository?')) return;
    try {
      await api.deleteRepo(id);
      toast.success('Repository deleted');
      loadRepos();
      navigate('/');
    } catch (e) {
      toast.error(e.message);
    }
  };

  const isActive = (repoId) => location.pathname === `/repos/${repoId}`;
  const isHome = location.pathname === '/';

  return (
    <div className="flex h-screen overflow-hidden">
      {/* ─── Mobile top bar ─── */}
      <header className="fixed top-0 left-0 right-0 z-50 md:hidden
                         bg-bau-surface dark:bg-bau-surface-dark
                         border-b-2 border-bau-ink dark:border-bau-ink-light">
        <div className="flex items-center justify-between px-4 h-12">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="flex items-center gap-[3px]">
              <div className="w-2.5 h-2.5 rounded-full bg-bau-red" />
              <div className="w-2.5 h-2.5 bg-bau-blue" />
              <div className="w-0 h-0" style={{ borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderBottom: '9px solid #F0C020' }} />
            </div>
            <span className="text-base font-black tracking-tight">RAT</span>
          </Link>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="p-2 hover:bg-bau-muted/50 dark:hover:bg-bau-muted-dark/50 transition-colors"
              aria-label="Toggle dark mode"
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 hover:bg-bau-muted/50 dark:hover:bg-bau-muted-dark/50 transition-colors"
              aria-label="Toggle menu"
            >
              {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </header>

      {/* ─── Mobile slide-over ─── */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setSidebarOpen(false)}>
          <div className="absolute inset-0 bg-bau-ink/40 dark:bg-black/60 backdrop-blur-sm" />
          <aside
            className="absolute left-0 top-12 bottom-0 w-72
                       bg-bau-surface dark:bg-bau-surface-dark
                       border-r-2 border-bau-ink dark:border-bau-ink-light
                       shadow-hard-lg dark:shadow-hard-lg-light
                       flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <SidebarContent
              repos={repos} isActive={isActive} isHome={isHome}
              handleDelete={handleDelete} onNavigate={() => setSidebarOpen(false)}
              darkMode={darkMode} setDarkMode={setDarkMode}
            />
          </aside>
        </div>
      )}

      {/* ─── Desktop sidebar ─── */}
      <aside className="hidden md:flex w-60 flex-col flex-shrink-0
                        bg-bau-surface dark:bg-bau-surface-dark
                        border-r-2 border-bau-ink dark:border-bau-ink-light">
        <SidebarContent
          repos={repos} isActive={isActive} isHome={isHome}
          handleDelete={handleDelete} onNavigate={() => {}}
          darkMode={darkMode} setDarkMode={setDarkMode}
        />
      </aside>

      {/* ─── Main content ─── */}
      <main className="flex-1 overflow-y-auto bg-bau-canvas dark:bg-bau-canvas-dark pt-12 md:pt-0">
        <Outlet context={{ repos, loadRepos }} />
      </main>
    </div>
  );
}

/* ════════════════════════════════════════
   Sidebar content (shared desktop/mobile)
   ════════════════════════════════════════ */
function SidebarContent({ repos, isActive, isHome, handleDelete, onNavigate, darkMode, setDarkMode }) {
  return (
    <>
      {/* Logo */}
      <Link to="/" onClick={onNavigate}
        className="flex items-center gap-3 px-5 py-5 border-b-2 border-bau-ink/10 dark:border-bau-ink-light/10
                   hover:bg-bau-canvas/50 dark:hover:bg-bau-muted-dark/30 transition-colors">
        <div className="flex items-center gap-[3px]">
          <div className="w-3.5 h-3.5 rounded-full bg-bau-red" />
          <div className="w-3.5 h-3.5 bg-bau-blue" />
          <div className="w-0 h-0" style={{ borderLeft: '7px solid transparent', borderRight: '7px solid transparent', borderBottom: '12px solid #F0C020' }} />
        </div>
        <div className="leading-none">
          <div className="text-lg font-black tracking-tight leading-none">RAT</div>
          <div className="text-[8px] font-bold uppercase tracking-[0.25em] text-bau-ink/40 dark:text-bau-ink-light/40 mt-0.5">
            Repo Analysis Tool
          </div>
        </div>
      </Link>

      {/* Nav: Home */}
      <div className="px-3 pt-3">
        <Link to="/" onClick={onNavigate}
          className={`flex items-center gap-2.5 px-3 py-2 text-xs font-bold uppercase tracking-wider transition-all
            ${isHome
              ? 'bg-bau-ink text-bau-ink-light dark:bg-bau-ink-light dark:text-bau-ink shadow-hard-sm dark:shadow-hard-sm-light'
              : 'hover:bg-bau-muted/40 dark:hover:bg-bau-muted-dark/40'
            }`}>
          <Home className="w-3.5 h-3.5" /> Dashboard
        </Link>
      </div>

      {/* Repo list */}
      <nav className="flex-1 overflow-y-auto px-3 pt-2 pb-3">
        <div className="text-[9px] font-bold uppercase tracking-[0.3em] text-bau-ink/30 dark:text-bau-ink-light/30 px-3 pt-3 pb-2">
          Repositories
          {repos.length > 0 && <span className="ml-1 font-mono">({repos.length})</span>}
        </div>

        {repos.length === 0 && (
          <p className="text-[11px] text-bau-ink/25 dark:text-bau-ink-light/25 px-3 py-6 text-center">
            No repositories yet
          </p>
        )}

        <div className="space-y-0.5">
          {repos.map(repo => (
            <Link
              key={repo.id}
              to={`/repos/${repo.id}`}
              onClick={onNavigate}
              className={`group flex items-center gap-2.5 px-3 py-2.5 transition-all duration-150 relative
                ${isActive(repo.id)
                  ? 'bg-bau-yellow/15 dark:bg-bau-yellow/10'
                  : 'hover:bg-bau-muted/30 dark:hover:bg-bau-muted-dark/30'
                }`}
            >
              {/* Active indicator bar */}
              {isActive(repo.id) && (
                <div className="absolute left-0 top-1 bottom-1 w-[3px] bg-bau-yellow" />
              )}

              <StatusDot status={repo.status} />

              <div className="min-w-0 flex-1">
                <div className={`text-[13px] font-semibold truncate leading-tight
                  ${isActive(repo.id) ? 'text-bau-ink dark:text-bau-ink-light' : 'text-bau-ink/70 dark:text-bau-ink-light/70'}`}>
                  {repo.name}
                </div>
                <div className="text-[10px] text-bau-ink/35 dark:text-bau-ink-light/35 leading-tight mt-0.5 font-medium">
                  {repo.status === 'ready' && repo.commit_count > 0 && (
                    <span className="font-mono tabular-nums">{repo.commit_count.toLocaleString()} commits</span>
                  )}
                  {repo.status === 'ingesting' && (
                    <span className="text-bau-warn">{Math.round(repo.progress_pct || 0)}%</span>
                  )}
                  {repo.status === 'error' && (
                    <span className="text-bau-red dark:text-bau-red-dark">Error</span>
                  )}
                  {repo.status === 'pending' && 'Pending'}
                </div>
              </div>

              {/* Ingestion mini-bar */}
              {repo.status === 'ingesting' && (
                <div className="absolute bottom-0 left-3 right-3 h-[2px] bg-bau-muted/50 dark:bg-bau-muted-dark/50">
                  <div className="h-full bg-bau-yellow transition-all" style={{ width: `${repo.progress_pct}%` }} />
                </div>
              )}

              <button
                onClick={(e) => handleDelete(repo.id, e)}
                className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1
                           text-bau-ink/20 hover:text-bau-red dark:text-bau-ink-light/20 dark:hover:text-bau-red-dark
                           transition-all flex-shrink-0"
                title="Delete repository"
                aria-label={`Delete ${repo.name}`}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </Link>
          ))}
        </div>
      </nav>

      {/* Bottom controls */}
      <div className="px-3 py-3 border-t-2 border-bau-ink/10 dark:border-bau-ink-light/10">
        <button
          onClick={() => setDarkMode(!darkMode)}
          className="w-full flex items-center justify-center gap-2 px-3 py-2
                     text-[11px] font-bold uppercase tracking-wider
                     text-bau-ink/50 dark:text-bau-ink-light/50
                     hover:text-bau-ink dark:hover:text-bau-ink-light
                     hover:bg-bau-muted/30 dark:hover:bg-bau-muted-dark/30
                     transition-all duration-150"
        >
          {darkMode ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
          {darkMode ? 'Light' : 'Dark'}
        </button>
      </div>
    </>
  );
}
