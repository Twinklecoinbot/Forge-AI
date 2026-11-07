const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');

let mainWindow;
let workspaceRoot = path.join(app.getPath('documents'), 'Forge AI Projects');
const settingsPath = path.join(app.getPath('userData'), 'forge-settings.json');

function loadSettings() {
  try {
    if (fs.existsSync(settingsPath)) {
      return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    }
  } catch {
    /* keep defaults */
  }
  return {};
}

function saveSettings(partial) {
  const next = { ...loadSettings(), ...partial };
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(next, null, 2), 'utf8');
  if (next.workspaceRoot) workspaceRoot = next.workspaceRoot;
  return next;
}

function ensureWorkspace() {
  const stored = loadSettings().workspaceRoot;
  if (stored) workspaceRoot = stored;
  fs.mkdirSync(workspaceRoot, { recursive: true });
  return workspaceRoot;
}

function resolveSafe(rel, rootOverride) {
  const root = path.resolve(rootOverride || ensureWorkspace());
  const target = path.resolve(root, String(rel || '').replace(/^[/\\]+/, ''));
  if (!target.startsWith(root)) throw new Error('Path escapes the workspace');
  return target;
}

function trainingDatasetPath() {
  const dir = path.join(ensureWorkspace(), 'workspace');
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'training_dataset.jsonl');
}

const TEXT_LIKE =
  /\.(txt|md|markdown|json|js|jsx|ts|tsx|mjs|cjs|css|scss|html?|xml|ya?ml|toml|ini|env|py|go|rs|java|kt|cs|php|rb|sh|bat|ps1|sql|graphql|vue|svelte|astro|c|cc|cpp|h|hpp|swift|r|lua|dart|scala|dockerfile|gitignore|gitattributes|editorconfig|npmrc|prettierrc|eslintrc)$/i;
const IMAGE_LIKE = /\.(png|jpe?g|gif|webp|bmp|svg|ico)$/i;
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'release', '.next', 'build', 'out', '.cache']);

function isTextFile(name) {
  if (TEXT_LIKE.test(name)) return true;
  if (IMAGE_LIKE.test(name)) return false;
  return !/\.[a-z0-9]+$/i.test(name);
}

function collectFolderFiles(dir, rel = '', limit = 400) {
  const files = [];
  if (!fs.existsSync(dir) || files.length >= limit) return files;
  for (const name of fs.readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const abs = path.join(dir, name);
    const relPath = rel ? `${rel}/${name}` : name;
    let stat;
    try {
      stat = fs.statSync(abs);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      files.push(...collectFolderFiles(abs, relPath, limit - files.length));
    } else if (stat.isFile() && isTextFile(name) && stat.size < 2_000_000) {
      try {
        files.push({ path: relPath.replace(/\\/g, '/'), content: fs.readFileSync(abs, 'utf8') });
      } catch {
        /* skip */
      }
    }
    if (files.length >= limit) break;
  }
  return files;
}

function createWindow() {
  ensureWorkspace();
  const isDev = !app.isPackaged;
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: '#181818',
    title: 'Forge AI',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  if (isDev) mainWindow.loadURL('http://localhost:5173');
  else mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

ipcMain.handle('write-project-files', async (_event, files, rootOverride) => {
  const root = rootOverride ? path.resolve(rootOverride) : ensureWorkspace();
  if (rootOverride) fs.mkdirSync(root, { recursive: true });
  const written = [];
  for (const file of files || []) {
    if (!file?.path) continue;
    const abs = resolveSafe(file.path, root);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, file.content ?? '', 'utf8');
    written.push(path.relative(root, abs).replace(/\\/g, '/'));
  }
  return { ok: true, workspace: root, written };
});

ipcMain.handle('run-terminal-command', async (_event, cmd, cwdOverride) => {
  const cwd = cwdOverride ? path.resolve(cwdOverride) : ensureWorkspace();
  return new Promise((resolve) => {
    const child = exec(String(cmd || ''), { cwd, windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        code: error?.code ?? 0,
        stdout: stdout || '',
        stderr: stderr || '',
        error: error ? error.message : null,
        cwd
      });
    });
    child.stdout?.on('data', (chunk) => {
      mainWindow?.webContents.send('terminal-stream', { stream: 'stdout', data: String(chunk) });
    });
    child.stderr?.on('data', (chunk) => {
      mainWindow?.webContents.send('terminal-stream', { stream: 'stderr', data: String(chunk) });
    });
  });
});

ipcMain.handle('select-workspace', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose Forge workspace',
    properties: ['openDirectory', 'createDirectory']
  });
  if (result.canceled || !result.filePaths[0]) return { ok: false };
  workspaceRoot = result.filePaths[0];
  saveSettings({ workspaceRoot });
  return { ok: true, workspace: workspaceRoot };
});

ipcMain.handle('select-folder', async (_event, opts = {}) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: opts.title || 'Choose project folder',
    defaultPath: opts.defaultPath || ensureWorkspace(),
    properties: ['openDirectory', 'createDirectory']
  });
  if (result.canceled || !result.filePaths[0]) return { ok: false };
  return { ok: true, path: result.filePaths[0], name: path.basename(result.filePaths[0]) };
});

ipcMain.handle('create-project-folder', async (_event, opts = {}) => {
  const parent = opts.parent || ensureWorkspace();
  const name = String(opts.name || 'New Project').replace(/[<>:"/\\|?*]/g, '-').trim() || 'New Project';
  const target = path.join(parent, name);
  fs.mkdirSync(target, { recursive: true });
  if (opts.seedReadme) {
    fs.writeFileSync(path.join(target, 'README.md'), `# ${name}\n\nBuilt with Forge AI.\n`, 'utf8');
  }
  return { ok: true, path: target, name };
});

ipcMain.handle('read-folder-files', async (_event, folderPath) => {
  const root = path.resolve(String(folderPath || ''));
  if (!root || !fs.existsSync(root)) throw new Error('Folder not found');
  return { ok: true, path: root, name: path.basename(root), files: collectFolderFiles(root) };
});

ipcMain.handle('create-path', async (_event, { root, rel, type, content }) => {
  const abs = resolveSafe(rel, root || ensureWorkspace());
  if (type === 'dir') fs.mkdirSync(abs, { recursive: true });
  else {
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    if (!fs.existsSync(abs)) fs.writeFileSync(abs, content ?? '', 'utf8');
  }
  return { ok: true, path: String(rel || '').replace(/\\/g, '/') };
});

function walkTree(dir, rel = '') {
  const entries = [];
  if (!fs.existsSync(dir)) return entries;
  for (const name of fs.readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const abs = path.join(dir, name);
    const relPath = rel ? `${rel}/${name}` : name;
    const stat = fs.statSync(abs);
    if (stat.isDirectory()) entries.push({ path: relPath, type: 'dir', children: walkTree(abs, relPath) });
    else entries.push({ path: relPath, type: 'file', size: stat.size });
  }
  return entries.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
    return a.path.localeCompare(b.path);
  });
}

ipcMain.handle('read-workspace-tree', async () => {
  const root = ensureWorkspace();
  return { ok: true, workspace: root, tree: walkTree(root) };
});

ipcMain.handle('read-file', async (_event, rel, rootOverride) => {
  const abs = resolveSafe(rel, rootOverride);
  return { ok: true, path: rel, content: fs.readFileSync(abs, 'utf8') };
});

ipcMain.handle('write-file', async (_event, rel, content, rootOverride) => {
  const abs = resolveSafe(rel, rootOverride);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content ?? '', 'utf8');
  return { ok: true, path: rel };
});

ipcMain.handle('delete-file', async (_event, rel, rootOverride) => {
  const abs = resolveSafe(rel, rootOverride);
  if (fs.existsSync(abs)) fs.rmSync(abs, { recursive: true, force: true });
  return { ok: true, path: rel };
});

ipcMain.handle('save-settings', async (_event, settings) => saveSettings(settings || {}));
ipcMain.handle('load-settings', async () => ({
  ...loadSettings(),
  workspaceRoot: ensureWorkspace(),
  platform: process.platform
}));
ipcMain.handle('open-external', async (_event, url) => {
  await shell.openExternal(String(url || ''));
  return { ok: true };
});

/** Self-improving dataset logger — OpenAI message schema JSONL */
ipcMain.handle('log-training-pair', async (_event, payload = {}) => {
  const file = trainingDatasetPath();
  const action = payload.action || 'accepted';
  const record = {
    id: payload.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    action,
    model: payload.model || null,
    systemRules: payload.systemRules || '',
    messages: Array.isArray(payload.messages)
      ? payload.messages
      : [
          { role: 'system', content: payload.systemRules || '' },
          { role: 'user', content: payload.prompt || '' },
          { role: 'assistant', content: payload.response || payload.code || '' }
        ].filter((m) => m.content),
    meta: {
      files: payload.files || [],
      projectId: payload.projectId || null,
      chatId: payload.chatId || null,
      edits: payload.edits || null
    }
  };
  fs.appendFileSync(file, `${JSON.stringify(record)}\n`, 'utf8');
  return { ok: true, path: file, id: record.id };
});

ipcMain.handle('read-training-dataset', async (_event, opts = {}) => {
  const file = trainingDatasetPath();
  if (!fs.existsSync(file)) return { ok: true, path: file, records: [] };
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean);
  const limit = Math.min(Number(opts.limit) || 80, 200);
  const action = opts.action || null;
  const records = [];
  for (let i = lines.length - 1; i >= 0 && records.length < limit; i--) {
    try {
      const row = JSON.parse(lines[i]);
      if (action && row.action !== action) continue;
      records.push(row);
    } catch {
      /* skip bad lines */
    }
  }
  return { ok: true, path: file, records: records.reverse() };
});
