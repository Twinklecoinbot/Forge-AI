import { useState } from 'react';
import { useForge } from '../store/ForgeContext.jsx';
import { treeFromFiles } from '../services/fileParser.js';
import FileIcon from './FileIcon.jsx';
import EditorPane from './EditorPane.jsx';

export default function FilesExplorer() {
  const { files, setActiveFile, setOpenTabs, setView, setWorkspaceMode, activeProject } = useForge();
  const [q, setQ] = useState('');
  const filtered = files.filter((f) => f.path.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="flex min-h-0 flex-1">
      <aside className="w-64 overflow-auto border-r border-[var(--border)] bg-[var(--bg-panel)] p-3">
        <div className="mb-2 truncate px-1 text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
          {activeProject?.name || 'EXPLORER'}
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter files"
          className="mb-3 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-[12px] outline-none"
        />
        {filtered.length === 0 ? (
          <div className="px-2 text-[12px] text-[var(--text-muted)]">No files yet — ask the agent to build.</div>
        ) : (
          treeFromFiles(filtered).map((node) => (
            <Node
              key={node.path}
              node={node}
              onOpen={(path) => {
                setActiveFile(path);
                setOpenTabs((t) => (t.includes(path) ? t : [...t, path]));
                setWorkspaceMode('code');
                setView('workspace');
              }}
            />
          ))
        )}
      </aside>
      <EditorPane />
    </div>
  );
}

function Node({ node, onOpen, depth = 0 }) {
  if (node.type === 'dir') {
    return (
      <div style={{ paddingLeft: depth * 10 }}>
        <div className="flex items-center gap-1.5 px-2 py-1 text-[12px] text-[var(--text-muted)]">
          <FileIcon type="dir" path={node.path} className="h-3.5 w-3.5" />
          <span className="truncate">{node.name}</span>
        </div>
        {(node.children || []).map((c) => (
          <Node key={c.path} node={c} onOpen={onOpen} depth={depth + 1} />
        ))}
      </div>
    );
  }
  return (
    <button
      style={{ paddingLeft: depth * 10 + 8 }}
      onClick={() => onOpen(node.path)}
      className="flex w-full items-center gap-1.5 truncate py-1 text-left text-[12.5px] hover:bg-[var(--bg-hover)]"
    >
      <FileIcon path={node.path} className="h-3.5 w-3.5" />
      <span className="truncate">{node.name}</span>
    </button>
  );
}
