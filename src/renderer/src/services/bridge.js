const VFS_KEY = 'forge.vfs';
const SETTINGS_KEY = 'forge.settings';
const TRAIN_KEY = 'forge.training_dataset';

function readVfs() {
  try {
    return JSON.parse(localStorage.getItem(VFS_KEY) || '{}');
  } catch {
    return {};
  }
}

function writeVfs(vfs) {
  localStorage.setItem(VFS_KEY, JSON.stringify(vfs));
}

function native() {
  return window.forgeAPI || null;
}

function vfsBucket(root) {
  const key = root || 'browser-workspace';
  const vfs = readVfs();
  if (!vfs[key] || typeof vfs[key] !== 'object' || Array.isArray(vfs[key])) {
    if (key === 'browser-workspace' && Object.keys(vfs).some((k) => typeof vfs[k] === 'string')) {
      const legacy = {};
      Object.entries(vfs).forEach(([p, c]) => {
        if (typeof c === 'string') legacy[p] = c;
      });
      return { store: { 'browser-workspace': legacy }, bucket: legacy, key };
    }
    vfs[key] = {};
  }
  return { store: vfs, bucket: vfs[key], key };
}

function readLocalTraining() {
  try {
    return JSON.parse(localStorage.getItem(TRAIN_KEY) || '[]');
  } catch {
    return [];
  }
}

export const bridge = {
  isElectron: Boolean(window.forgeAPI?.isElectron),

  async writeFiles(files, root) {
    if (native()) return native().writeFiles(files, root);
    const { store, bucket, key } = vfsBucket(root);
    (files || []).forEach((file) => {
      bucket[file.path] = file.content ?? '';
    });
    store[key] = bucket;
    writeVfs(store);
    return { ok: true, workspace: key, written: (files || []).map((f) => f.path) };
  },

  async runCommand(cmd, cwd) {
    if (native()) return native().runCommand(cmd, cwd);
    return {
      ok: false,
      stdout: '',
      stderr: `Terminal is available in the Forge AI desktop app.\nSkipped: ${cmd}`,
      cwd: cwd || 'browser-workspace'
    };
  },

  async selectWorkspace() {
    if (native()) return native().selectWorkspace();
    return { ok: true, workspace: 'browser-workspace' };
  },

  async selectFolder(opts = {}) {
    if (native()?.selectFolder) return native().selectFolder(opts);
    return { ok: false, browser: true };
  },

  async createProjectFolder(opts = {}) {
    if (native()?.createProjectFolder) return native().createProjectFolder(opts);
    const name = String(opts.name || 'New Project').trim() || 'New Project';
    const root = `browser://${name}`;
    const { store, bucket, key } = vfsBucket(root);
    if (opts.seedReadme) bucket['README.md'] = `# ${name}\n\nBuilt with Forge AI.\n`;
    store[key] = bucket;
    writeVfs(store);
    return { ok: true, path: root, name };
  },

  async readFolderFiles(folderPath) {
    if (native()?.readFolderFiles) return native().readFolderFiles(folderPath);
    const { bucket } = vfsBucket(folderPath);
    return {
      ok: true,
      path: folderPath,
      name: String(folderPath).replace(/^browser:\/\//, ''),
      files: Object.entries(bucket).map(([path, content]) => ({ path, content }))
    };
  },

  async createPath({ root, rel, type, content }) {
    if (native()?.createPath) return native().createPath({ root, rel, type, content });
    const { store, bucket, key } = vfsBucket(root);
    if (type === 'dir') bucket[`${String(rel).replace(/\/$/, '')}/.keep`] = '';
    else bucket[rel] = content ?? '';
    store[key] = bucket;
    writeVfs(store);
    return { ok: true, path: rel };
  },

  async readTree() {
    if (native()) return native().readTree();
    return { ok: true, workspace: 'browser-workspace', tree: [] };
  },

  async readFile(rel, root) {
    if (native()) return native().readFile(rel, root);
    const { bucket } = vfsBucket(root);
    if (!(rel in bucket)) throw new Error(`Missing file: ${rel}`);
    return { ok: true, path: rel, content: bucket[rel] };
  },

  async writeFile(rel, content, root) {
    if (native()) return native().writeFile(rel, content, root);
    const { store, bucket, key } = vfsBucket(root);
    bucket[rel] = content ?? '';
    store[key] = bucket;
    writeVfs(store);
    return { ok: true, path: rel };
  },

  async deleteFile(rel, root) {
    if (native()) return native().deleteFile(rel, root);
    const { store, bucket, key } = vfsBucket(root);
    delete bucket[rel];
    store[key] = bucket;
    writeVfs(store);
    return { ok: true, path: rel };
  },

  async saveSettings(settings) {
    if (native()) return native().saveSettings(settings);
    const next = { ...this.loadSettingsSync(), ...settings };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    return next;
  },

  loadSettingsSync() {
    try {
      return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    } catch {
      return {};
    }
  },

  async loadSettings() {
    if (native()) return native().loadSettings();
    return { ...this.loadSettingsSync(), workspaceRoot: 'browser-workspace', platform: 'web' };
  },

  async openExternal(url) {
    if (native()?.openExternal) return native().openExternal(url);
    window.open(url, '_blank', 'noopener,noreferrer');
  },

  async logTrainingPair(payload) {
    if (native()?.logTrainingPair) return native().logTrainingPair(payload);
    const list = readLocalTraining();
    const record = {
      id: payload?.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
      action: payload?.action || 'accepted',
      model: payload?.model || null,
      systemRules: payload?.systemRules || '',
      messages: Array.isArray(payload?.messages)
        ? payload.messages
        : [
            { role: 'system', content: payload?.systemRules || '' },
            { role: 'user', content: payload?.prompt || '' },
            { role: 'assistant', content: payload?.response || payload?.code || '' }
          ].filter((m) => m.content),
      meta: {
        files: payload?.files || [],
        projectId: payload?.projectId || null,
        chatId: payload?.chatId || null
      }
    };
    list.push(record);
    localStorage.setItem(TRAIN_KEY, JSON.stringify(list.slice(-500)));
    return { ok: true, path: 'localStorage:forge.training_dataset', id: record.id };
  },

  async readTrainingDataset(opts = {}) {
    if (native()?.readTrainingDataset) return native().readTrainingDataset(opts);
    let records = readLocalTraining();
    if (opts.action) records = records.filter((r) => r.action === opts.action);
    const limit = Math.min(Number(opts.limit) || 80, 200);
    return { ok: true, path: 'localStorage:forge.training_dataset', records: records.slice(-limit) };
  },

  onTerminalStream(callback) {
    if (native()?.onTerminalStream) return native().onTerminalStream(callback);
    return () => {};
  }
};
