import { useMemo, useState } from 'react';
import { FileCode2, MessageSquare, Search } from 'lucide-react';
import { useForge } from '../store/ForgeContext.jsx';

export default function SearchModal() {
  const { searchOpen, setSearchOpen, files, chats, setActiveFile, setOpenTabs, setView, setActiveChatId } = useForge();
  const [q, setQ] = useState('');
  const results = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return [];
    return [
      ...files.filter((f) => f.path.toLowerCase().includes(query)).slice(0, 8).map((f) => ({ type: 'file', ...f })),
      ...chats.filter((c) => c.title.toLowerCase().includes(query)).slice(0, 8).map((c) => ({ type: 'chat', ...c }))
    ];
  }, [q, files, chats]);
  if (!searchOpen) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-start bg-black/50 p-6 pt-[12vh]" onClick={() => setSearchOpen(false)}>
      <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-3">
          <Search size={16} className="text-[var(--text-muted)]" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search files and chats" className="flex-1 bg-transparent text-[14px] outline-none" />
        </div>
        <div className="max-h-[50vh] overflow-auto py-2">
          {results.map((item) => (
            <button key={`${item.type}-${item.id || item.path}`} className="flex w-full items-center gap-2 px-4 py-2 text-left text-[13px] hover:bg-[var(--bg-hover)]"
              onClick={() => {
                if (item.type === 'file') {
                  setActiveFile(item.path);
                  setOpenTabs((t) => (t.includes(item.path) ? t : [...t, item.path]));
                  setView('workspace');
                } else {
                  setActiveChatId(item.id);
                  setView(item.messages?.length ? 'agent' : 'home');
                }
                setSearchOpen(false);
              }}>
              {item.type === 'file' ? <FileCode2 size={14} /> : <MessageSquare size={14} />}
              <span className="truncate">{item.path || item.title}</span>
            </button>
          ))}
          {!results.length && q && <div className="px-4 py-6 text-[12px] text-[var(--text-muted)]">No matches</div>}
        </div>
      </div>
    </div>
  );
}
