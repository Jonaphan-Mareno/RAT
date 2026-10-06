import { useState, useEffect } from 'react';
import { Outlet, Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import toast from 'react-hot-toast';

export default function Layout() {
  const [repos, setRepos] = useState([]);
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('darkMode') === 'true');
  const navigate = useNavigate();

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    localStorage.setItem('darkMode', darkMode);
  }, [darkMode]);

  const loadRepos = async () => {
    try {
      const data = await api.getRepos();
      setRepos(data);
    } catch (e) {
      console.error(e);
    }
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

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <Link to="/" className="flex items-center gap-2">
            <span className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">RAT</span>
            <span className="text-xs text-gray-500 dark:text-gray-400">Repo Analysis Tool</span>
          </Link>
        </div>

        <nav className="flex-1 overflow-y-auto p-2">
          <div className="text-xs font-semibold text-gray-400 uppercase px-3 py-2">Repositories</div>
          {repos.length === 0 && (
            <p className="text-sm text-gray-400 px-3 py-2">No repositories yet</p>
          )}
          {repos.map(repo => (
            <Link
              key={repo.id}
              to={`/repos/${repo.id}`}
              className="flex items-center justify-between px-3 py-2 rounded-lg text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors group"
            >
              <div className="min-w-0">
                <div className="font-medium truncate dark:text-gray-200">{repo.name}</div>
                <div className="text-xs text-gray-400">
                  {repo.status === 'ready' ? `${repo.commit_count} commits` :
                   repo.status === 'ingesting' ? `Ingesting... ${Math.round(repo.progress_pct)}%` :
                   repo.status === 'error' ? 'Error' : 'Pending'}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <span className={`w-2 h-2 rounded-full ${
                  repo.status === 'ready' ? 'bg-green-400' :
                  repo.status === 'ingesting' ? 'bg-yellow-400 animate-pulse' :
                  repo.status === 'error' ? 'bg-red-400' : 'bg-gray-400'
                }`} />
                <button
                  onClick={(e) => handleDelete(repo.id, e)}
                  className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 text-xs ml-1"
                  title="Delete"
                >
                  &times;
                </button>
              </div>
            </Link>
          ))}
        </nav>

        <div className="p-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <button
            onClick={() => setDarkMode(!darkMode)}
            className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            {darkMode ? 'Light Mode' : 'Dark Mode'}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900">
        <Outlet context={{ repos, loadRepos }} />
      </main>
    </div>
  );
}
