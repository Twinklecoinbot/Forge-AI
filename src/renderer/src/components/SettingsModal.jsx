import { useEffect, useMemo, useState } from 'react';
import { Github, Link2, RefreshCw, Save, X } from 'lucide-react';
import { useForge } from '../store/ForgeContext.jsx';
import { bridge } from '../services/bridge.js';
import { CODING_FREE_MODEL, DEFAULT_MODELS, detectLocalModels, resolveWorkingModel } from '../services/openRouterEngine.js';

export default function SettingsModal() {
  const {
    settingsOpen,
    setSettingsOpen,
    settings,
    saveSettings,
    saveCustomize,
    models,
    localModels,
    setLocalModels,
    isElectron,
    connectGithub,
    showToast
  } = useForge();
  const [detecting, setDetecting] = useState(false);
  const provider = settings.provider || 'openrouter';
  const modelOptions = useMemo(
    () => (provider === 'local' ? localModels || [] : models || DEFAULT_MODELS),
    [provider, localModels, models]
  );

  useEffect(() => {
    if (!settingsOpen || provider !== 'local') return;
    if ((localModels || []).length) return;
    (async () => {
      setDetecting(true);
      try {
        const result = await detectLocalModels(settings.localBaseUrl || 'http://127.0.0.1:11434');
        if (result.ok) {
          setLocalModels(result.models);
          if (!result.models.some((m) => m.id === settings.model)) {
            await saveSettings({ model: result.models[0].id });
          }
        }
      } catch {
        /* ignore auto-detect */
      } finally {
        setDetecting(false);
      }
    })();
  }, [settingsOpen, provider]);

  if (!settingsOpen) return null;

  const detectNow = async () => {
    setDetecting(true);
    try {
      const result = await detectLocalModels(settings.localBaseUrl || 'http://127.0.0.1:11434');
      if (!result.ok) {
        showToast(result.error || 'No local models found');
        setLocalModels([]);
        return;
      }
      setLocalModels(result.models);
      if (!result.models.some((m) => m.id === settings.model)) {
        await saveSettings({ model: result.models[0].id });
      }
      showToast(`Found ${result.models.length} local model${result.models.length === 1 ? '' : 's'}`);
    } catch (e) {
      showToast(e.message || 'Local detect failed');
    } finally {
      setDetecting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-6">
      <div className="flex max-h-[min(88vh,720px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <h2 className="text-[16px] font-semibold">Customize</h2>
          <button onClick={() => setSettingsOpen(false)}>
            <X size={16} />
          </button>
        </div>
        <div className="forge-scroll min-h-0 flex-1 px-5 py-4">

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

        <label className="mb-1 block text-[12px] text-[var(--text-muted)]">AI server</label>
        <div className="mb-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() =>
              saveSettings({
                provider: 'openrouter',
                model: resolveWorkingModel(settings.model, { provider: 'openrouter' }) || CODING_FREE_MODEL
              })
            }
            className={`rounded-md border px-3 py-2 text-left text-[12.5px] ${
              provider === 'openrouter'
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                : 'border-[var(--border)] bg-[var(--bg)] text-[var(--text-muted)]'
            }`}
          >
            <div className="font-medium text-[var(--text)]">OpenRouter (online)</div>
            <div className="mt-0.5 text-[11px]">Cloud models via OpenRouter</div>
          </button>
          <button
            type="button"
            onClick={() => saveSettings({ provider: 'local' })}
            className={`rounded-md border px-3 py-2 text-left text-[12.5px] ${
              provider === 'local'
                ? 'border-sky-500/40 bg-sky-500/10 text-sky-200'
                : 'border-[var(--border)] bg-[var(--bg)] text-[var(--text-muted)]'
            }`}
          >
            <div className="font-medium text-[var(--text)]">Local server model</div>
            <div className="mt-0.5 text-[11px]">Ollama / OpenAI-compatible</div>
          </button>
        </div>

        {provider === 'local' && (
          <div className="mb-4 rounded-md border border-[var(--border)] bg-[var(--bg)] p-3">
            <label className="mb-1 block text-[12px] text-[var(--text-muted)]">Local server URL</label>
            <input
              value={settings.localBaseUrl || 'http://127.0.0.1:11434'}
              onChange={(e) => saveSettings({ localBaseUrl: e.target.value })}
              placeholder="http://127.0.0.1:11434"
              className="mb-2 w-full rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-[13px] outline-none"
            />
            <button
              type="button"
              disabled={detecting}
              onClick={detectNow}
              className="inline-flex items-center gap-2 rounded-md border border-[var(--border)] px-3 py-1.5 text-[12px] hover:bg-[var(--bg-hover)] disabled:opacity-50"
            >
              <RefreshCw size={13} className={detecting ? 'animate-spin' : ''} />
              {detecting ? 'Detecting…' : 'Detect local models'}
            </button>
            {!modelOptions.length && (
              <p className="mt-2 text-[11px] text-[var(--text-muted)]">
                Start Ollama (or another local server), then detect models. Online OpenRouter stays unchanged until you switch back.
              </p>
            )}
          </div>
        )}

        <label className="mb-1 block text-[12px] text-[var(--text-muted)]">Default model</label>
        <select
          value={settings.model}
          onChange={(e) => saveSettings({ model: e.target.value })}
          className="mb-4 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[13px] outline-none"
        >
          {modelOptions.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
          {!modelOptions.some((m) => m.id === settings.model) && settings.model ? (
            <option value={settings.model}>{settings.model}</option>
          ) : null}
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
          <div className="mb-4">
            <div className="mb-2 flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[12.5px] text-emerald-300">
              <Link2 size={14} />
              Connected as @{settings.githubUser.login}
            </div>
            <button
              type="button"
              className="text-[12px] text-[var(--text-muted)] underline"
              onClick={() => saveSettings({ githubToken: '', githubUser: null })}
            >
              Disconnect (keeps rules, projects, chats)
            </button>
          </div>
        )}

        <div className="rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[12px] text-[var(--text-muted)]">
          Runtime: {isElectron ? 'Electron desktop (self-contained Forge engine)' : 'Browser preview'}
          <div className="mt-1">Workspace: {settings.workspaceRoot || 'browser-workspace'}</div>
          <div className="mt-1 text-[11px]">
            Provider: {provider === 'local' ? 'Local server' : 'OpenRouter (online)'} · Forge does not use Cursor IDE APIs.
          </div>
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

        </div>
        <div className="flex shrink-0 justify-end gap-2 border-t border-[var(--border)] px-5 py-3">
          <button
            className="rounded-md border border-[var(--border)] px-3 py-2 text-[13px] text-[var(--text)]"
            onClick={() => setSettingsOpen(false)}
          >
            Close
          </button>
          <button
            className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-[13px] font-medium"
            style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
            onClick={async () => {
              await saveCustomize();
              setSettingsOpen(false);
            }}
          >
            <Save size={14} /> Save
          </button>
        </div>
      </div>
    </div>
  );
}
