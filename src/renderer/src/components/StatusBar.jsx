import { useForge } from '../store/ForgeContext.jsx';

export default function StatusBar() {
  const { status, busy, files, settings, isElectron, setTerminalOpen, setView, setWorkspaceMode, activeProject, projectRoot, learningBusy } = useForge();
  return (
    <footer className="flex h-8 shrink-0 items-center justify-between border-t border-[var(--border)] bg-[var(--bg-sidebar)] px-3 text-[11px] text-[var(--text-muted)]">
      <div className="flex min-w-0 items-center gap-3">
        <span className="shrink-0 font-medium text-[var(--text)]">Forge AI</span>
        <span className={busy ? 'text-emerald-400' : ''}>{status}</span>
        {learningBusy && <span className="text-sky-300">Learning style…</span>}
        <button onClick={() => { setWorkspaceMode('files'); setView('files'); }}>{files.length} files</button>
        <button onClick={() => setTerminalOpen(true)}>Terminal</button>
        {activeProject?.name && <span className="truncate">{activeProject.name}</span>}
      </div>
      <div className="flex min-w-0 items-center gap-3">
        <span className="max-w-[240px] truncate">{projectRoot || (isElectron ? 'Desktop' : 'Web preview')}</span>
        <span className="shrink-0">{settings.model}</span>
      </div>
    </footer>
  );
}
