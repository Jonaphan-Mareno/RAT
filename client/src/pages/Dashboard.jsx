import { useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { api } from '../api';
import toast from 'react-hot-toast';

export default function Dashboard() {
  const { repos, loadRepos } = useOutletContext();
  const navigate = useNavigate();
  const [tab, setTab] = useState('clone');
  const [cloneUrl, setCloneUrl] = useState('');
  const [repoName, setRepoName] = useState('');
  const [reference, setReference] = useState('');
  const [loading, setLoading] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const handleClone = async (e) => {
    e.preventDefault();
    if (!cloneUrl) return toast.error('Enter a repository URL');
    setLoading(true);
    try {
      const result = await api.cloneRepo(cloneUrl, repoName || undefined, reference || undefined);
      toast.success('Repository cloning started!');
      loadRepos();
      navigate(`/repos/${result.id}`);
      setCloneUrl('');
      setRepoName('');
      setReference('');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const uploadFile = async (file) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.zip')) {
      toast.error('Select a .zip file');
      return;
    }

    setLoading(true);
    try {
      const result = await api.uploadZip(file, repoName || file.name.replace(/\.zip$/i, ''), reference || undefined);
      toast.success('Repository uploaded! Processing...');
      loadRepos();
      navigate(`/repos/${result.id}`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    uploadFile(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    if (!loading) uploadFile(e.dataTransfer.files[0]);
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-2 dark:text-white">Repo Analysis Tool</h1>
      <p className="text-gray-500 dark:text-gray-400 mb-8">
        Upload or clone a git repository to analyze its metrics — file churn, directory aggregates, author ownership, and more.
      </p>

      {/* Upload Card */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-8">
        <h2 className="text-lg font-semibold mb-4 dark:text-white">Add Repository</h2>

        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setTab('clone')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === 'clone'
                ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300'
                : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            Clone URL
          </button>
          <button
            onClick={() => setTab('zip')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === 'zip'
                ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300'
                : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            Upload Zip
          </button>
        </div>

        {tab === 'clone' && (
          <form onSubmit={handleClone} className="space-y-3">
            <input
              type="text"
              value={cloneUrl}
              onChange={(e) => setCloneUrl(e.target.value)}
              placeholder="https://github.com/user/repo.git"
              className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
            />
            <input
              type="text"
              value={repoName}
              onChange={(e) => setRepoName(e.target.value)}
              placeholder="Repository name (optional)"
              className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
            />
            <input
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Reference commit, tag, or branch (defaults to HEAD)"
              className="w-full px-4 py-2 border rounded-lg font-mono text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
            />
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Cloning...' : 'Clone Repository'}
            </button>
          </form>
        )}

        {tab === 'zip' && (
          <div className="space-y-3">
            <input
              type="text"
              value={repoName}
              onChange={(e) => setRepoName(e.target.value)}
              placeholder="Repository name (optional)"
              className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
            />
            <input
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Reference commit, tag, or branch (defaults to HEAD)"
              className="w-full px-4 py-2 border rounded-lg font-mono text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
            />
            <label
              onDragEnter={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragOver={(e) => e.preventDefault()}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
              className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
                dragActive
                  ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950'
                  : 'border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              <div className="text-center px-4">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {loading ? 'Uploading...' : 'Drop a .zip file here or click to browse'}
                </p>
                <p className="text-xs text-gray-400 mt-1">The archive must include its .git directory.</p>
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                  GitHub Download ZIP files omit history; use Clone URL for those.
                </p>
              </div>
              <input
                type="file"
                accept=".zip"
                onChange={handleUpload}
                disabled={loading}
                className="hidden"
              />
            </label>
          </div>
        )}
      </div>

      {/* Repo Cards */}
      {repos.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-4 dark:text-white">Your Repositories</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {repos.map(repo => (
              <div
                key={repo.id}
                onClick={() => navigate(`/repos/${repo.id}`)}
                className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5 cursor-pointer hover:shadow-md transition-shadow"
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold dark:text-white">{repo.name}</h3>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    repo.status === 'ready' ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' :
                    repo.status === 'ingesting' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300' :
                    repo.status === 'error' ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' :
                    'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                  }`}>
                    {repo.status}
                  </span>
                </div>
                {repo.status === 'ingesting' && (
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-2">
                    <div className="bg-indigo-600 h-2 rounded-full transition-all" style={{ width: `${repo.progress_pct}%` }} />
                  </div>
                )}
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  {repo.commit_count > 0 && <span>{repo.commit_count} commits</span>}
                  {repo.ref_commit && <span className="ml-2 font-mono text-xs">{repo.ref_commit.slice(0, 8)}</span>}
                </div>
                {repo.error_message && (
                  <p className="text-xs text-red-500 mt-2 truncate">{repo.error_message}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
