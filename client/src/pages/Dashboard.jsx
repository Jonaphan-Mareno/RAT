import { useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { api } from '../api';
import toast from 'react-hot-toast';
import {
  Link2, Upload, Circle, Square, Triangle, AlertTriangle, GitBranch
} from 'lucide-react';

function StatusTag({ status }) {
  const base = 'tag';
  if (status === 'ready') return <span className={`${base} bg-bau-success/10 text-bau-success border-bau-success`}><Circle className="w-2.5 h-2.5 fill-current" /> Ready</span>;
  if (status === 'ingesting') return <span className={`${base} bg-bau-yellow/10 text-bau-warn border-bau-warn`}><Square className="w-2.5 h-2.5 fill-current animate-pulse" /> Ingesting</span>;
  if (status === 'error') return <span className={`${base} bg-bau-red/10 text-bau-red border-bau-red`}><Triangle className="w-2.5 h-2.5 fill-current" /> Error</span>;
  return <span className={`${base} bg-bau-muted/30 text-bau-ink/50 dark:text-bau-ink-light/50 border-bau-muted`}>Pending</span>;
}

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
    <div className="p-6 md:p-10 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-10 relative">
        {/* Decorative shapes */}
        <div className="absolute -top-4 -right-4 opacity-10">
          <div className="w-24 h-24 rounded-full border-[6px] border-bau-red" />
        </div>
        <div className="absolute top-8 right-12 opacity-10">
          <div className="w-16 h-16 border-[6px] border-bau-blue" />
        </div>
        <h1 className="text-4xl md:text-6xl font-black uppercase tracking-tighter leading-tight">
          Repo Analysis<br />Tool
        </h1>
        <p className="text-sm font-medium text-bau-ink/60 dark:text-bau-ink-light/60 mt-3 max-w-md">
          Upload or clone a git repository to analyze file churn, directory aggregates, author ownership, and more.
        </p>
      </div>

      {/* Add Repository Panel */}
      <div className="panel mb-10">
        <h2 className="text-xl font-bold uppercase tracking-wider mb-6">Add Repository</h2>

        {/* Mode toggle */}
        <div className="flex border-2 border-bau-ink dark:border-bau-ink-light mb-6">
          <button
            onClick={() => setTab('clone')}
            className={`flex-1 flex items-center justify-center gap-2 px-6 py-4 text-sm font-bold uppercase tracking-wider transition-all
              ${tab === 'clone'
                ? 'bg-bau-blue text-white'
                : 'bg-transparent text-bau-ink dark:text-bau-ink-light hover:bg-bau-blue/10'
              }`}
          >
            <Link2 className="w-5 h-5" /> Clone URL
          </button>
          <button
            onClick={() => setTab('zip')}
            className={`flex-1 flex items-center justify-center gap-2 px-6 py-4 text-sm font-bold uppercase tracking-wider transition-all border-l-2 border-bau-ink dark:border-bau-ink-light
              ${tab === 'zip'
                ? 'bg-bau-yellow text-bau-ink'
                : 'bg-transparent text-bau-ink dark:text-bau-ink-light hover:bg-bau-yellow/10'
              }`}
          >
            <Upload className="w-5 h-5" /> Upload Zip
          </button>
        </div>

        {/* Shared name + ref inputs */}
        <div className="space-y-3 mb-4">
          <input
            type="text"
            value={repoName}
            onChange={(e) => setRepoName(e.target.value)}
            placeholder="Repository name (optional)"
            className="input"
          />
          <input
            type="text"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="Reference commit, tag, or branch (defaults to HEAD)"
            className="input font-mono text-xs"
          />
        </div>

        {tab === 'clone' && (
          <form onSubmit={handleClone} className="space-y-4">
            <input
              type="text"
              value={cloneUrl}
              onChange={(e) => setCloneUrl(e.target.value)}
              placeholder="https://github.com/user/repo.git"
              className="input font-mono"
            />
            <button type="submit" disabled={loading} className="btn-blue disabled:opacity-50">
              {loading ? 'Cloning...' : 'Clone Repository'}
            </button>
          </form>
        )}

        {tab === 'zip' && (
          <div className="space-y-4">
            <label
              onDragEnter={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragOver={(e) => e.preventDefault()}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
              className={`flex flex-col items-center justify-center w-full h-36 border-4 border-dashed cursor-pointer transition-all
                ${dragActive
                  ? 'border-bau-yellow bg-bau-yellow/5'
                  : 'border-bau-ink/30 dark:border-bau-ink-light/30 hover:border-bau-ink dark:hover:border-bau-ink-light'
                }`}
            >
              <Upload className="w-8 h-8 text-bau-ink/30 dark:text-bau-ink-light/30 mb-2" />
              <p className="text-sm font-medium text-bau-ink/60 dark:text-bau-ink-light/60">
                {loading ? 'Uploading...' : 'Drop .zip here or click to browse'}
              </p>
              <p className="text-[10px] font-bold uppercase tracking-wider text-bau-ink/40 dark:text-bau-ink-light/40 mt-1">
                Must include .git directory
              </p>
              <p className="text-[10px] text-bau-warn mt-1 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> GitHub ZIP omits history — use Clone URL instead
              </p>
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

      {/* Repo cards grid */}
      {repos.length > 0 && (
        <div>
          <h2 className="text-xl font-bold uppercase tracking-wider mb-6">
            Your Repositories
            <span className="ml-2 text-sm font-mono text-bau-ink/40 dark:text-bau-ink-light/40 normal-case">({repos.length})</span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {repos.map(repo => (
              <div
                key={repo.id}
                onClick={() => navigate(`/repos/${repo.id}`)}
                className="card card-hover p-5 relative overflow-hidden"
              >
                {/* Corner shape decoration */}
                <div className="absolute top-0 right-0 w-3 h-3 bg-bau-red" />

                <div className="flex items-start justify-between mb-3">
                  <h3 className="text-lg font-bold uppercase tracking-tight">{repo.name}</h3>
                  <StatusTag status={repo.status} />
                </div>

                {repo.status === 'ingesting' && (
                  <div className="w-full bg-bau-muted dark:bg-bau-muted-dark h-2 mb-3 border border-bau-ink/20 dark:border-bau-ink-light/20">
                    <div className="bg-bau-yellow h-full transition-all" style={{ width: `${repo.progress_pct}%` }} />
                  </div>
                )}

                <div className="flex items-center gap-4 text-xs">
                  {repo.commit_count > 0 && (
                    <span className="flex items-center gap-1.5 font-bold">
                      <GitBranch className="w-3.5 h-3.5" />
                      <span className="font-mono tabular-nums">{repo.commit_count.toLocaleString()}</span>
                      <span className="font-normal text-bau-ink/50 dark:text-bau-ink-light/50">commits</span>
                    </span>
                  )}
                  {repo.ref_commit && (
                    <span className="font-mono text-[10px] text-bau-ink/40 dark:text-bau-ink-light/40 tabular-nums">
                      {repo.ref_commit.slice(0, 10)}
                    </span>
                  )}
                </div>

                {repo.error_message && (
                  <p className="text-xs text-bau-red dark:text-bau-red-dark mt-3 truncate border-t-2 border-bau-red/20 pt-2">
                    {repo.error_message}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {repos.length === 0 && (
        <div className="dot-grid py-20 text-center">
          <div className="flex justify-center gap-4 mb-6 opacity-20">
            <div className="w-16 h-16 rounded-full border-4 border-bau-ink dark:border-bau-ink-light" />
            <div className="w-16 h-16 border-4 border-bau-ink dark:border-bau-ink-light" />
          </div>
          <p className="text-lg font-bold uppercase tracking-wider text-bau-ink/30 dark:text-bau-ink-light/30">
            No repositories yet
          </p>
          <p className="text-sm text-bau-ink/20 dark:text-bau-ink-light/20 mt-1">
            Clone or upload a repo to get started
          </p>
        </div>
      )}
    </div>
  );
}
