const API = 'https://api.github.com';

function headers(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json'
  };
}

async function gh(token, path, options = {}) {
  if (!token) throw new Error('Connect GitHub in Settings first.');
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: { ...headers(token), ...(options.headers || {}) }
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { message: text };
  }
  if (!res.ok) throw new Error(data?.message || `GitHub ${res.status}`);
  return data;
}

export async function getGithubUser(token) {
  return gh(token, '/user');
}
export async function listRepos(token) {
  return gh(token, '/user/repos?per_page=50&sort=updated');
}
export async function createRepo(token, { name, description, isPrivate = false }) {
  return gh(token, '/user/repos', {
    method: 'POST',
    body: JSON.stringify({
      name,
      description: description || 'Created by Forge AI',
      private: isPrivate,
      auto_init: true,
      has_issues: true
    })
  });
}
export async function upsertFile(token, { owner, repo, path, content, message, sha }) {
  return gh(token, `/repos/${owner}/${repo}/contents/${encodeURI(path)}`, {
    method: 'PUT',
    body: JSON.stringify({
      message: message || `Forge AI: update ${path}`,
      content: btoa(unescape(encodeURIComponent(content ?? ''))),
      sha
    })
  });
}
export async function getFileSha(token, { owner, repo, path }) {
  try {
    const data = await gh(token, `/repos/${owner}/${repo}/contents/${encodeURI(path)}`);
    return data.sha;
  } catch {
    return null;
  }
}
export function preparePagesFiles(files = []) {
  const map = new Map(
    (files || [])
      .filter((f) => f?.path && typeof f.content === 'string' && !String(f.content).startsWith('data:'))
      .map((f) => [f.path.replace(/^\/+/, ''), f])
  );
  if (!map.has('.nojekyll')) map.set('.nojekyll', { path: '.nojekyll', content: '' });
  const hasIndex = [...map.keys()].some((p) => p.toLowerCase() === 'index.html' || p.toLowerCase().endsWith('/index.html'));
  if (!hasIndex) {
    map.set('index.html', {
      path: 'index.html',
      content: `<!doctype html><html><head><meta charset="utf-8"/><title>Forge AI</title></head><body><h1>Deployed with Forge AI</h1></body></html>`
    });
  }
  return [...map.values()];
}
export async function pushFiles(token, { owner, repo, files, message }) {
  const prepared = preparePagesFiles(files);
  const results = [];
  for (const file of prepared) {
    const sha = await getFileSha(token, { owner, repo, path: file.path });
    const result = await upsertFile(token, {
      owner,
      repo,
      path: file.path,
      content: file.content,
      message: message || `Forge AI sync: ${file.path}`,
      sha
    });
    results.push({ path: file.path, html_url: result.content?.html_url });
  }
  return results;
}
export async function enablePages(token, { owner, repo, branch = 'main' }) {
  const body = { build_type: 'legacy', source: { branch, path: '/' } };
  try {
    return await gh(token, `/repos/${owner}/${repo}/pages`, { method: 'POST', body: JSON.stringify(body) });
  } catch (error) {
    const msg = String(error.message || '').toLowerCase();
    if (msg.includes('already') || msg.includes('409')) {
      await gh(token, `/repos/${owner}/${repo}/pages`, { method: 'PUT', body: JSON.stringify(body) });
      return getPages(token, { owner, repo });
    }
    throw error;
  }
}
export async function getPages(token, { owner, repo }) {
  return gh(token, `/repos/${owner}/${repo}/pages`);
}
export async function waitForPages(token, { owner, repo, attempts = 6 }) {
  let last = null;
  for (let i = 0; i < attempts; i++) {
    try {
      last = await getPages(token, { owner, repo });
      if (last?.html_url) return last;
    } catch {
      /* not ready */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return last;
}
export async function setRepoHomepage(token, { owner, repo, homepage }) {
  return gh(token, `/repos/${owner}/${repo}`, { method: 'PATCH', body: JSON.stringify({ homepage }) });
}
export function pagesUrl(owner, repo) {
  return `https://${owner}.github.io/${repo}/`;
}
