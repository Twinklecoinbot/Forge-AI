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
/** Create repo or reuse an existing one with the same name (avoids deploy failures on re-publish). */
export async function ensureRepo(token, { name, description, isPrivate = false }) {
  try {
    return await createRepo(token, { name, description, isPrivate });
  } catch (error) {
    const msg = String(error.message || '').toLowerCase();
    if (!/already exists|name already|422/.test(msg)) throw error;
    const user = await getGithubUser(token);
    return gh(token, `/repos/${user.login}/${encodeURIComponent(name)}`);
  }
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
      content: `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>Forge App</title>
<style>body{margin:0;font-family:system-ui,sans-serif;background:#0b0d10;color:#e8eef7;min-height:100vh;display:grid;place-items:center}main{max-width:640px;padding:32px;border:1px solid #243041;border-radius:16px}a{color:#3d8bfd}</style></head>
<body><main><h1>Forge App</h1><p>Interactive UI files were missing from this publish. Re-run the agent build, then publish again.</p></main></body></html>`
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
export async function waitForPages(token, { owner, repo, attempts = 20 }) {
  let last = null;
  for (let i = 0; i < attempts; i++) {
    try {
      last = await getPages(token, { owner, repo });
      const url = last?.html_url
        ? last.html_url.endsWith('/')
          ? last.html_url
          : `${last.html_url}/`
        : pagesUrl(owner, repo);
      // Prefer a real HTTP 200 that is not GitHub's Pages 404 shell
      if (url && (await probeLiveUrl(url))) {
        return { ...last, html_url: url, status: last?.status || 'built' };
      }
      if (last?.status === 'built' && last?.html_url && i > 10) return last;
    } catch {
      /* not ready yet */
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return last;
}

/** HEAD/GET probe — returns true when Pages returns a real page (not GitHub's 404 shell). */
export async function probeLiveUrl(url = '') {
  const target = String(url || '').trim();
  if (!target || !/^https?:\/\//i.test(target)) return false;
  try {
    const res = await fetch(target, { method: 'GET', cache: 'no-store', redirect: 'follow' });
    if (!res.ok) return false;
    const text = await res.text();
    if (/There isn't a GitHub Pages site here/i.test(text)) return false;
    return true;
  } catch {
    return false;
  }
}
export async function setRepoHomepage(token, { owner, repo, homepage }) {
  return gh(token, `/repos/${owner}/${repo}`, { method: 'PATCH', body: JSON.stringify({ homepage }) });
}
export async function renameRepo(token, { owner, repo, name }) {
  const next = String(name || '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
  if (!next) throw new Error('Enter a new repository name');
  return gh(token, `/repos/${owner}/${repo}`, { method: 'PATCH', body: JSON.stringify({ name: next }) });
}
export async function deleteRepo(token, { owner, repo }) {
  if (!owner || !repo) throw new Error('Missing repository');
  return gh(token, `/repos/${owner}/${repo}`, { method: 'DELETE' });
}
export function pagesUrl(owner, repo) {
  return `https://${owner}.github.io/${repo}/`;
}
