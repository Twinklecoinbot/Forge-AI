import { useState } from 'react';
import { useForge } from '../store/ForgeContext.jsx';
import { treeFromFiles } from '../services/fileParser.js';
import EditorPane from './EditorPane.jsx';

export default function FilesExplorer() {
  const { files, setActiveFile, setOpenTabs, setView } = useForge();
  const [q, setQ] = useState('');
  const filtered = files.filter((f) => f.path.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="flex min-h-0 flex-1">
      <aside className="w-64 overflow-auto border-r border-[var(--border)] bg-[var(--bg-panel)] p-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter files" className="mb-3 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-[12px] outline-none" />
        {treeFromFiles(filtered).map((node) => (
          <Node key={node.path} node={node} onOpen={(path) => { setActiveFile(path); setOpenTabs((t) => (t.includes(path) ? t : [...t, path])); setView('workspace'); }} />
        ))}
      </aside>
      <EditorPane />
    </div>
  );
}
function Node({ node, onOpen, depth = 0 }) {
  if (node.type === 'dir') {
    return (
      <div style={{ paddingLeft: depth * 10 }}>
        <div className="px-2 py-1 text-[12px] text-[var(--text-muted)]">{node.name}</div>
        {(node.children || []).map((c) => <Node key={c.path} node={c} onOpen={onOpen} depth={depth + 1} />)}
      </div>
    );
  }
  return <button style={{ paddingLeft: depth * 10 + 8 }} onClick={() => onOpen(node.path)} className="block w-full truncate py-1 text-left text-[12.5px] hover:bg-[var(--bg-hover)]">{node.name}</button>;
}
