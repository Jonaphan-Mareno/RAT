const BASE = '/api';

async function request(url, options = {}) {
  const res = await fetch(BASE + url, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

export const api = {
  // Repos
  getRepos: () => request('/repos'),
  getRepo: (id) => request(`/repos/${id}`),
  deleteRepo: (id) => request(`/repos/${id}`, { method: 'DELETE' }),
  cloneRepo: (url, name) => request('/repos/clone', {
    method: 'POST',
    body: JSON.stringify({ url, name }),
  }),
  uploadZip: async (file, name) => {
    const form = new FormData();
    form.append('file', file);
    if (name) form.append('name', name);
    const res = await fetch(BASE + '/repos/upload', { method: 'POST', body: form });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || 'Upload failed');
    }
    return res.json();
  },

  // Commits
  getCommits: (repoId, params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/repos/${repoId}/commits?${qs}`);
  },

  // Files
  getFiles: (repoId) => request(`/repos/${repoId}/files`),

  // Metrics
  getFileMetrics: (repoId, params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/repos/${repoId}/metrics/file?${qs}`);
  },
  getDirectoryMetrics: (repoId, params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/repos/${repoId}/metrics/directory?${qs}`);
  },
  getRepoMetrics: (repoId, params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/repos/${repoId}/metrics/repository?${qs}`);
  },
  getCommitSetMetrics: (repoId, params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/repos/${repoId}/metrics/commit-set?${qs}`);
  },
  getAuthorMetrics: (repoId, params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/repos/${repoId}/metrics/author?${qs}`);
  },

  // Authors
  getAuthors: (repoId) => request(`/repos/${repoId}/authors`),
  mergeAuthors: (repoId, data) => request(`/repos/${repoId}/authors/merge`, {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  unmergeAuthors: (repoId, groupId) =>
    request(`/repos/${repoId}/authors/groups/${groupId}`, { method: 'DELETE' }),
};

// SSE helper for ingestion status
export function subscribeToStatus(repoId, onMessage) {
  const source = new EventSource(`${BASE}/repos/${repoId}/status`);
  source.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      onMessage(data);
    } catch {}
  };
  source.onerror = () => {
    source.close();
  };
  return () => source.close();
}

// Export helper
export function downloadData(data, filename, type = 'json') {
  let content, mime;
  if (type === 'csv') {
    if (!Array.isArray(data) || data.length === 0) return;
    const headers = Object.keys(data[0]);
    const rows = data.map(r => headers.map(h => JSON.stringify(r[h] ?? '')).join(','));
    content = [headers.join(','), ...rows].join('\n');
    mime = 'text/csv';
  } else {
    content = JSON.stringify(data, null, 2);
    mime = 'application/json';
  }
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
