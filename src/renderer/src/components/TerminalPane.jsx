import { useState } from 'react';
import { useForge } from '../store/ForgeContext.jsx';

export default function TerminalPane() {
  const { terminalOpen, setTerminalOpen, terminal, runCommand } = useForge();
  const [cmd, setCmd] = useState('');
  if (!terminalOpen) return null;
  return (
    <div className="flex h-48 shrink-0 flex-col border-t border-[var(--border)] bg-[#0f0f0f]">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-1 text-[11px] text-[var(--text-muted)]">
        <span>Terminal</span>
        <button onClick={() => setTerminalOpen(false)}>Hide</button>
      </div>
      <div className="flex-1 overflow-auto px-3 py-2 font-mono text-[12px]">
        {terminal.map((line) => (
          <div key={line.id} className={line.stream === 'stderr' ? 'text-red-300' : line.stream === 'cmd' ? 'text-emerald-300' : ''}>
            {line.data}
          </div>
        ))}
      </div>
      <form className="flex border-t border-[var(--border)]" onSubmit={(e) => { e.preventDefault(); if (!cmd.trim()) return; runCommand(cmd.trim()); setCmd(''); }}>
        <span className="px-3 py-2 font-mono text-[12px] text-[var(--text-muted)]">$</span>
        <input value={cmd} onChange={(e) => setCmd(e.target.value)} className="flex-1 bg-transparent py-2 font-mono text-[12px] outline-none" />
      </form>
    </div>
  );
}
