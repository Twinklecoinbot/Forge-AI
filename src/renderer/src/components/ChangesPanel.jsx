import { FileCode2 } from 'lucide-react';
import { useForge } from '../store/ForgeContext.jsx';

export default function ChangesPanel() {
  const { files, setActiveFile, setOpenTabs, setView } = useForge();
  return (
    <div className="mx-auto w-full max-w-3xl overflow-auto px-8 py-8">
      <h1 className="text-2xl font-semibold">Changes</h1>
      <p className="mt-1 text-[13px] text-[var(--text-muted)]">{files.length} files in the active project</p>
      <div className="mt-6 divide-y divide-[var(--border)] rounded-xl border border-[var(--border)]">
        {files.length === 0 && <div className="p-4 text-[13px] text-[var(--text-muted)]">No generated files yet.</div>}
        {files.map((file) => (
          <button key={file.path} className="flex w-full items-center gap-2 px-4 py-2 text-left text-[13px] hover:bg-[var(--bg-hover)]"
            onClick={() => { setActiveFile(file.path); setOpenTabs((t) => (t.includes(file.path) ? t : [...t, file.path])); setView('workspace'); }}>
            <FileCode2 size={14} className="text-[var(--text-muted)]" />{file.path}
          </button>
        ))}
      </div>
    </div>
  );
}
