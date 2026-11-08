export function extractFiles(text = '') {
  const files = [];
  const seen = new Set();
  const add = (path, content) => {
    const cleanPath = normalizePath(path);
    if (!cleanPath || cleanPath.startsWith('http') || seen.has(cleanPath)) return;
    seen.add(cleanPath);
    files.push({ path: cleanPath, content: stripFence(content) });
  };
  const forgeBlock = /<<<FILE path="([^"]+)">>>\n?([\s\S]*?)<<<END FILE>>>/g;
  let match;
  while ((match = forgeBlock.exec(text))) add(match[1], match[2]);
  extractJsonFiles(text).forEach((file) => add(file.path, file.content));
  const fence = /```([^\n]*)\n([\s\S]*?)```/g;
  while ((match = fence.exec(text))) {
    const meta = match[1].trim();
    if (meta.toLowerCase() === 'json') continue;
    const path = parseFencePath(meta);
    if (path) add(path, match[2]);
  }
  return files;
}

export function extractJsonFiles(text = '') {
  const files = [];
  const chunks = [];
  const jsonFence = /```json\s*\n([\s\S]*?)```/gi;
  let match;
  while ((match = jsonFence.exec(text))) chunks.push(match[1]);
  const raw = text.match(/\{[\s\S]*"files"\s*:\s*\[[\s\S]*?\][\s\S]*\}/);
  if (raw) chunks.push(raw[0]);
  for (const chunk of chunks) {
    try {
      const parsed = JSON.parse(stripFence(chunk));
      const list = parsed.files || parsed.project?.files || [];
      if (!Array.isArray(list)) continue;
      list.forEach((file) => {
        if (file?.path && typeof file.content === 'string') {
          files.push({ path: normalizePath(file.path), content: stripFence(file.content) });
        }
      });
    } catch {
      /* ignore */
    }
  }
  return files;
}

export function extractCommands(text = '') {
  const cmds = [];
  const re = /(?:^|\n)\s*(?:\$|>)\s*((?:npm|pnpm|yarn|npx|node|python|pip|git)\s+[^\n]+)/g;
  let match;
  while ((match = re.exec(text))) cmds.push(match[1].trim());
  return [...new Set(cmds)].slice(0, 5);
}

export function languageFromPath(path = '') {
  const ext = path.split('.').pop()?.toLowerCase();
  const map = {
    js: 'javascript',
    jsx: 'javascript',
    ts: 'typescript',
    tsx: 'typescript',
    json: 'json',
    css: 'css',
    scss: 'scss',
    html: 'html',
    md: 'markdown',
    py: 'python',
    go: 'go',
    rs: 'rust',
    yml: 'yaml',
    yaml: 'yaml'
  };
  return map[ext] || 'plaintext';
}

export function treeFromFiles(files = []) {
  const root = [];
  const ensureDir = (parts) => {
    let nodes = root;
    let acc = '';
    for (const part of parts) {
      acc = acc ? `${acc}/${part}` : part;
      let node = nodes.find((n) => n.type === 'dir' && n.name === part);
      if (!node) {
        node = { path: acc, name: part, type: 'dir', children: [] };
        nodes.push(node);
      }
      nodes = node.children;
    }
    return nodes;
  };
  files.forEach((file) => {
    const parts = file.path.split('/');
    const name = parts.pop();
    const bucket = parts.length ? ensureDir(parts) : root;
    bucket.push({ path: file.path, name, type: 'file' });
  });
  const sortNodes = (nodes) => {
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    nodes.forEach((n) => n.children && sortNodes(n.children));
  };
  sortNodes(root);
  return root;
}

export function projectNameFromPrompt(text = '') {
  const clean = text.replace(/^\/\w+\s*/, '').replace(/\s+/g, ' ').trim();
  return clean.slice(0, 42) || 'Untitled project';
}

export function previewHtml(files = []) {
  const candidates = files.filter((f) => /\.html?$/i.test(f.path || ''));
  const htmlFile =
    candidates.find((f) => f.path === 'index.html' && !isStubPreviewHtml(f.content)) ||
    candidates.find((f) => f.path.endsWith('/index.html') && !isStubPreviewHtml(f.content)) ||
    candidates.find((f) => !isStubPreviewHtml(f.content)) ||
    candidates.find((f) => f.path === 'index.html') ||
    candidates[0];
  if (!htmlFile) return null;
  const css = files
    .filter((f) => f.path.endsWith('.css') && !f.path.includes('node_modules'))
    .map((f) => `<style data-forge-src="${f.path}">\n${f.content}\n</style>`)
    .join('\n');
  const js = files
    .filter((f) => /\.(m?js|cjs)$/i.test(f.path) && !f.path.includes('node_modules') && !/config\./i.test(f.path))
    .map((f) => `<script data-forge-src="${f.path}">\n${f.content}\n</script>`)
    .join('\n');
  let html = String(htmlFile.content || '');
  // Drop external stylesheet/script tags that won't resolve inside blob/srcDoc previews
  html = html
    .replace(/<link[^>]+href=["'](?!https?:|data:)[^"']+["'][^>]*>/gi, '')
    .replace(/<script[^>]+src=["'](?!https?:|data:)[^"']+["'][^>]*>\s*<\/script>/gi, '');
  if (/<html/i.test(html)) {
    if (!/<\/head>/i.test(html)) html = html.replace(/<body/i, `<head>${css}</head><body`);
    else html = html.replace(/<\/head>/i, `${css}</head>`);
    if (!/<\/body>/i.test(html)) html = `${html}${js}`;
    else html = html.replace(/<\/body>/i, `${js}</body>`);
    return html;
  }
  return `<!doctype html><html><head><meta charset="utf-8"/>${css}</head><body>${html}${js}</body></html>`;
}

function isStubPreviewHtml(content = '') {
  return /Project files are arranged|files are in the Code tab|Deployed with Forge AI/i.test(String(content || ''));
}

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|svg|ico)$/i;
const TEXT_EXT =
  /\.(txt|md|markdown|json|js|jsx|ts|tsx|mjs|cjs|css|scss|html?|xml|ya?ml|toml|ini|env|py|go|rs|java|kt|cs|php|rb|sh|bat|ps1|sql|graphql|vue|svelte|astro|c|cc|cpp|h|hpp|swift|r|lua|dart|scala|dockerfile|gitignore)$/i;
const BINARY_EXT = /\.(pdf|zip|rar|7z|tar|gz|exe|dll|so|dylib|wasm|mp3|mp4|mov|avi|webm|woff2?|ttf|eot)$/i;

export function isImagePath(path = '') {
  return IMAGE_EXT.test(path);
}
export function isLikelyTextPath(path = '') {
  if (isImagePath(path) || BINARY_EXT.test(path)) return false;
  if (TEXT_EXT.test(path)) return true;
  return !/\.[a-z0-9]+$/i.test(path.split('/').pop() || '');
}

export function readBrowserFile(file) {
  return new Promise((resolve, reject) => {
    const name = file.name || 'file';
    const path = (file.webkitRelativePath || name).replace(/\\/g, '/');
    const mime = file.type || '';
    if (isImagePath(path) || mime.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = () =>
        resolve({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name,
          path,
          mime: mime || 'image/*',
          kind: 'image',
          size: file.size,
          dataUrl: String(reader.result || ''),
          content: ''
        });
      reader.onerror = () => reject(reader.error || new Error(`Failed to read ${name}`));
      reader.readAsDataURL(file);
      return;
    }
    if (BINARY_EXT.test(path)) {
      resolve({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name,
        path,
        mime: mime || 'application/octet-stream',
        kind: 'binary',
        size: file.size,
        content: `[Binary file: ${name}]`
      });
      return;
    }
    const reader = new FileReader();
    reader.onload = () =>
      resolve({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name,
        path,
        mime: mime || 'text/plain',
        kind: 'text',
        size: file.size,
        content: String(reader.result || '')
      });
    reader.onerror = () => reject(reader.error || new Error(`Failed to read ${name}`));
    reader.readAsText(file);
  });
}

function normalizePath(path = '') {
  return String(path).replace(/\\/g, '/').replace(/^\.\//, '').trim();
}
function stripFence(content = '') {
  return String(content).replace(/^\uFEFF/, '').replace(/\n$/, '');
}
function parseFencePath(meta = '') {
  const direct = meta.match(/(?:file|path)=["']?([^"'\s]+)["']?/i);
  if (direct) return direct[1];
  // ```tsx app/page.tsx  OR  ```typescript src/index.ts
  const langPath = meta.match(/^(?:tsx?|jsx?|javascript|typescript|json|css|html|md|prisma|sql|bash|sh)\s+([^\s]+)$/i);
  if (langPath) return langPath[1];
  if (/[./]/.test(meta) && !/\s/.test(meta)) return meta;
  return null;
}
