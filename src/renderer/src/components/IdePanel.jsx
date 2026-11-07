import { Files, GitBranch, Globe, TerminalSquare } from 'lucide-react';
import { useForge } from '../store/ForgeContext.jsx';

export default function IdePanel() {
  const { view, setView, setWorkspaceMode, setTerminalOpen, activeProject, openTabs, setActiveFile, chats, setActiveChatId, browserUrl } = useForge();
  const projectLive = activeProject?.githubRepo?.live || '';
  const label = (() => {
    const raw = browserUrl || projectLive;
    if (!raw) return 'Preview';
    try {
      const u = new URL(raw);
      return `${u.host}${u.pathname === '/' ? '' : u.pathname.replace(/\/$/, '')}`;
    } catch {
      return raw.replace(/^https?:\/\//, '');
    }
  })();

  return (
    <aside className="forge-scroll flex h-full w-[220px] shrink-0 flex-col border-l border-[var(--border)] bg-[var(--bg-sidebar)] py-3">
      <div className="px-4 pb-1 text-[11px] uppercase tracking-wider text-[var(--text-muted)]">Open Tabs</div>
      <Item active={view === 'home' || view === 'agent'} onClick={() => { setWorkspaceMode('chat'); setView(view === 'agent' ? 'agent' : 'home'); }}>Forge AI</Item>
      <Item active={view === 'browser'} onClick={() => { setWorkspaceMode('browser'); setView('browser'); }} title={browserUrl || projectLive || 'Generated HTML'}>{label}</Item>
      {chats.filter((c) => !c.archived && c.messages.length).slice(0, 4).map((chat) => (
        <Item key={chat.id} onClick={() => { setActiveChatId(chat.id); setWorkspaceMode('chat'); setView('agent'); }}>{chat.title}</Item>
      ))}
      {openTabs.slice(0, 6).map((path) => (
        <Item key={path} onClick={() => { setActiveFile(path); setWorkspaceMode('code'); setView('workspace'); }}>{path.split('/').pop()}</Item>
      ))}
      <div className="mt-4 px-4 pb-1 text-[11px] uppercase tracking-wider text-[var(--text-muted)]">On {activeProject?.name || 'Forge AI'}</div>
      <Item icon={GitBranch} active={view === 'changes'} onClick={() => { setWorkspaceMode('changes'); setView('changes'); }}>Changes</Item>
      <Item icon={Globe} active={view === 'browser'} onClick={() => { setWorkspaceMode('browser'); setView('browser'); }}>Browser</Item>
      <Item icon={TerminalSquare} onClick={() => { setTerminalOpen(true); setView('workspace'); }}>Terminal</Item>
      <Item icon={Files} active={view === 'files'} onClick={() => { setWorkspaceMode('files'); setView('files'); }}>Files</Item>
    </aside>
  );
}

function Item({ children, onClick, icon: Icon, active, title }) {
  return (
    <button onClick={onClick} title={title} className={`flex w-full items-center gap-2 px-4 py-1.5 text-left text-[13px] ${active ? 'text-[var(--text)]' : 'hover:bg-[var(--bg-hover)]'}`}>
      {Icon ? <Icon size={14} className="text-[var(--text-muted)]" /> : <Globe size={14} className="text-[var(--text-muted)]" />}
      <span className="truncate">{children}</span>
    </button>
  );
}
