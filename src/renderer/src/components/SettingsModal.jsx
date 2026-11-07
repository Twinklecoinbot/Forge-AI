import { Github, Link2, Save, X } from 'lucide-react';
import { useForge } from '../store/ForgeContext.jsx';
import { bridge } from '../services/bridge.js';

export default function SettingsModal() {
  const {
    settingsOpen,
    setSettingsOpen,
    settings,
    saveSettings,
    saveCustomize,
    models,
    isElectron,
    connectGithub,
    showToast
  } = useForge();
  if (!settingsOpen) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-6">
      <div className="w-full max-w-lg rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[16px] font-semibold">Customize</h2>
          <button onClick={() => setSettingsOpen(false)}>
            <X size={16} />
          </button>
        </div>

        <label className="mb-1 block text-[12px] text-[var(--text-muted)]">OpenRouter API key</label>
        <input
          type="password"
          value={settings.openRouterKey}
          onChange={(e) => saveSettings({ openRouterKey: e.target.value })}
          className="mb-3 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[13px] outline-none"
        />
        <label className="mb-1 block text-[12px] text-[var(--text-muted)]">Backup OpenRouter key</label>
        <input
          type="password"
          value={settings.openRouterKey2 || ''}
          onChange={(e) => saveSettings({ openRouterKey2: e.target.value })}
          className="mb-4 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[13px] outline-none"
        />
        <label className="mb-1 block text-[12px] text-[var(--text-muted)]">Default model</label>
        <select
          value={settings.model}
          onChange={(e) => saveSettings({ model: e.target.value })}
          className="mb-4 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[13px] outline-none"
        >
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>

        <label className="mb-1 block text-[12px] text-[var(--text-muted)]">GitHub token</label>
        <div className="mb-4 flex gap-2">
          <input
            type="password"
            value={settings.githubToken}
            onChange={(e) => saveSettings({ githubToken: e.target.value })}
            className="flex-1 rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[13px] outline-none"
          />
          <button
            type="button"
            onClick={async () => {
              try {
                if (!settings.githubToken) {
                  showToast('Paste a GitHub token first');
                  return;
                }
                await connectGithub(settings.githubToken);
              } catch (e) {
                showToast(e.message);
              }
            }}
            className="inline-flex items-center gap-2 rounded-md bg-[#238636] px-3 py-2 text-[12.5px] font-medium text-white hover:bg-[#2ea043]"
          >
            <Github size={15} />
            Connect
          </button>
        </div>
        {settings.githubUser && (
          <div className="mb-4 flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[12.5px] text-emerald-300">
            <Link2 size={14} />
            Connected as @{settings.githubUser.login}
          </div>
        )}

        <div className="rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[12px] text-[var(--text-muted)]">
          Runtime: {isElectron ? 'Electron desktop (self-contained Forge engine)' : 'Browser preview'}
          <div className="mt-1">Workspace: {settings.workspaceRoot || 'browser-workspace'}</div>
          <div className="mt-1 text-[11px]">Forge does not use Cursor IDE APIs or permissions.</div>
        </div>

        {isElectron && (
          <button
            className="mt-3 text-[12.5px] underline"
            onClick={async () => {
              const picked = await bridge.selectWorkspace();
              if (picked.ok) {
                await saveSettings({ workspaceRoot: picked.workspace });
                showToast('Saved successfully');
              }
            }}
          >
            Choose workspace folder
          </button>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={() => setSettingsOpen(false)}
            className="rounded-md border border-[var(--border)] px-3 py-1.5 text-[12.5px]"
          >
            Close
          </button>
          <button
            onClick={async () => {
              await saveCustomize();
            }}
            className="inline-flex items-center gap-1.5 rounded-md bg-[var(--text)] px-3 py-1.5 text-[12.5px] font-medium text-[var(--bg)]"
          >
            <Save size={14} /> Save
          </button>
        </div>
      </div>
    </div>
  );
}
