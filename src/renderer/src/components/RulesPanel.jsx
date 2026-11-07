import { Plus, Save, Sparkles, Trash2 } from 'lucide-react';
import { useForge } from '../store/ForgeContext.jsx';
import { compileSystemPrompt } from '../services/rulesEngine.js';
import { REA_PANEL } from '../services/reaGuide.js';

export default function RulesPanel() {
  const { rules, setRules, addRule, maybeRefineRules, learningBusy, settings, saveRules } = useForge();
  const update = (id, patch) => setRules((all) => all.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const preview = compileSystemPrompt(rules);

  return (
    <div className="flex h-full overflow-auto">
      <div className="mx-auto flex w-full max-w-5xl flex-col px-8 py-8">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Automations · Rules engine</h1>
            <p className="mt-1 max-w-2xl text-[13.5px] text-[var(--text-muted)]">
              Add or edit rules, then Save to persist them for every future Forge prompt.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => maybeRefineRules()}
              disabled={learningBusy || !settings.openRouterKey}
              className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-3 py-1.5 text-[12.5px] disabled:opacity-40"
            >
              <Sparkles size={14} /> {learningBusy ? 'Learning…' : 'Refine from dataset'}
            </button>
            <button
              onClick={addRule}
              className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-3 py-1.5 text-[12.5px]"
            >
              <Plus size={14} /> Add rule
            </button>
            <button
              onClick={() => saveRules()}
              className="inline-flex items-center gap-1.5 rounded-md bg-[var(--text)] px-3 py-1.5 text-[12.5px] font-medium text-[var(--bg)]"
            >
              <Save size={14} /> Save
            </button>
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-3">
            {rules.map((rule) => (
              <div key={rule.id} className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
                <div className="mb-2 flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={rule.enabled !== false}
                    onChange={(e) => update(rule.id, { enabled: e.target.checked })}
                  />
                  <input
                    value={rule.title}
                    onChange={(e) => update(rule.id, { title: e.target.value })}
                    className="flex-1 bg-transparent text-[13px] font-medium outline-none"
                  />
                  {rule.learned && <span className="text-[10px] text-emerald-400">learned</span>}
                  <button
                    onClick={() => setRules((all) => all.filter((r) => r.id !== rule.id))}
                    className="text-[var(--text-muted)]"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <textarea
                  value={rule.body}
                  onChange={(e) => update(rule.id, { body: e.target.value })}
                  rows={4}
                  className="w-full resize-y bg-transparent text-[12.5px] leading-5 outline-none"
                />
                <div className="mt-3 flex justify-end">
                  <button
                    onClick={() => saveRules()}
                    className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2.5 py-1 text-[11px] hover:bg-[var(--bg-hover)]"
                  >
                    <Save size={12} /> Save rule
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="space-y-4">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-panel)] p-4">
              <div className="mb-2 text-[12px] uppercase tracking-wider text-[var(--text-muted)]">Compiled prompt</div>
              <pre className="whitespace-pre-wrap text-[11.5px] leading-5 text-[var(--text-muted)]">{preview}</pre>
            </div>
            <div className="rounded-xl border border-[var(--border)] p-4">
              <div className="text-[13px] font-medium">{REA_PANEL.title}</div>
              <p className="mt-1 text-[12.5px] text-[var(--text-muted)]">{REA_PANEL.summary}</p>
              <a className="mt-2 inline-block text-[12px] underline" href={REA_PANEL.repo} target="_blank" rel="noreferrer">
                github.com/morluto/rea
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
