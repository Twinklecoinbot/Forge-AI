import { useEffect, useRef } from 'react';
import { useForge } from '../store/ForgeContext.jsx';
import Composer from './Composer.jsx';

export default function ChatPanel() {
  const { activeChat, busy } = useForge();
  const endRef = useRef(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [activeChat?.messages, busy]);
  return (
    <div className="flex w-[360px] shrink-0 flex-col border-l border-[var(--border)] bg-[var(--bg-panel)]">
      <div className="border-b border-[var(--border)] px-4 py-2 text-[12px] text-[var(--text-muted)]">Agent</div>
      <div className="forge-scroll flex-1 px-4 py-3">
        {(activeChat?.messages || []).map((m) => (
          <div key={m.id} className="mb-4">
            <div className="mb-1 text-[11px] text-[var(--text-muted)]">{m.role === 'user' ? 'You' : 'Forge'}</div>
            <div className="whitespace-pre-wrap text-[12.5px] leading-5">{m.content || (busy ? '…' : '')}</div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <div className="p-3"><Composer compact /></div>
    </div>
  );
}
