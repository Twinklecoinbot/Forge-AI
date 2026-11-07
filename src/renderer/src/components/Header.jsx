import { Code2, Files, Globe, MessageSquare } from 'lucide-react';
import { useForge } from '../store/ForgeContext.jsx';

const tabs = [
  { id: 'chat', label: 'Chat', icon: MessageSquare, view: 'home' },
  { id: 'code', label: 'Code', icon: Code2, view: 'workspace' },
  { id: 'files', label: 'Files', icon: Files, view: 'files' },
  { id: 'preview', label: 'Preview', icon: Globe, view: 'browser' }
];

export default function Header() {
  const { view, setView, setWorkspaceMode } = useForge();
  const active =
    view === 'agent' || view === 'home'
      ? 'chat'
      : view === 'workspace'
        ? 'code'
        : view === 'files'
          ? 'files'
          : view === 'browser'
            ? 'preview'
            : 'chat';

  return (
    <header className="flex h-10 shrink-0 items-center gap-1 border-b border-[var(--border)] bg-[var(--bg-panel)] px-3">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        return (
          <button
            key={tab.id}
            onClick={() => {
              setWorkspaceMode(tab.id);
              setView(tab.view === 'home' ? (view === 'agent' ? 'agent' : 'home') : tab.view);
            }}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12.5px] ${
              active === tab.id ? 'bg-[var(--bg-active)] text-[var(--text)]' : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)]'
            }`}
          >
            <Icon size={14} />
            {tab.label}
          </button>
        );
      })}
    </header>
  );
}
