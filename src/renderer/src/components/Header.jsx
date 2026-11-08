import { Code2, Files, Globe, MessageSquare } from 'lucide-react';
import { useForge } from '../store/ForgeContext.jsx';

const tabs = [
  { id: 'chat', label: 'Chat', icon: MessageSquare, mode: 'chat' },
  { id: 'code', label: 'Code', icon: Code2, mode: 'code' },
  { id: 'files', label: 'Files', icon: Files, mode: 'files' },
  { id: 'preview', label: 'Preview', icon: Globe, mode: 'browser' }
];

export default function Header() {
  const { view, setView, setWorkspaceMode, activeProject, activeChat, openProject, setBrowserUrl } = useForge();
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

  const onTab = (tab) => {
    // A standalone New Chat stays in Chats — header Chat must not jump back to a project chat
    if (tab.mode === 'chat' && activeChat && !activeChat.projectId) {
      setWorkspaceMode('chat');
      setView(activeChat.messages?.length ? 'agent' : 'home');
      return;
    }
    if (activeProject?.id && activeChat?.projectId) {
      if (tab.mode === 'browser') {
        const preview = activeProject.previewUrl || '';
        if (preview) setBrowserUrl(preview);
      }
      openProject(activeProject.id, { mode: tab.mode });
      return;
    }
    if (tab.mode === 'chat') {
      setWorkspaceMode('chat');
      setView(activeChat?.messages?.length ? 'agent' : 'home');
      return;
    }
    if (tab.mode === 'code') {
      setWorkspaceMode('code');
      setView('workspace');
      return;
    }
    if (tab.mode === 'files') {
      setWorkspaceMode('files');
      setView('files');
      return;
    }
    setWorkspaceMode('browser');
    setView('browser');
  };

  return (
    <header className="flex h-10 shrink-0 items-center gap-1 border-b border-[var(--border)] bg-[var(--bg-panel)] px-3">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        return (
          <button
            key={tab.id}
            onClick={() => onTab(tab)}
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
