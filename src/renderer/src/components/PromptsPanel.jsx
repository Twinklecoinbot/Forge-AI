import { Plus, Trash2 } from 'lucide-react';
import { useForge } from '../store/ForgeContext.jsx';

export default function PromptsPanel() {
  const { prompts, setPrompts, setComposer, setView } = useForge();
  return (
    <div className="mx-auto w-full max-w-3xl overflow-auto px-8 py-8">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Prompt library</h1>
        <button className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-3 py-1.5 text-[12px]"
          onClick={() => setPrompts((p) => [{ id: Math.random().toString(36).slice(2, 8), title: 'New prompt', body: '' }, ...p])}>
          <Plus size={14} /> Add
        </button>
      </div>
      <div className="space-y-3">
        {prompts.map((prompt) => (
          <div key={prompt.id} className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
            <div className="mb-2 flex gap-2">
              <input value={prompt.title} onChange={(e) => setPrompts((all) => all.map((x) => x.id === prompt.id ? { ...x, title: e.target.value } : x))} className="flex-1 bg-transparent text-[13px] font-medium outline-none" />
              <button onClick={() => { setComposer(prompt.body); setView('home'); }} className="text-[12px] underline">Use</button>
              <button onClick={() => setPrompts((all) => all.filter((x) => x.id !== prompt.id))}><Trash2 size={14} /></button>
            </div>
            <textarea value={prompt.body} onChange={(e) => setPrompts((all) => all.map((x) => x.id === prompt.id ? { ...x, body: e.target.value } : x))} rows={3} className="w-full bg-transparent text-[12.5px] outline-none" />
          </div>
        ))}
      </div>
    </div>
  );
}
