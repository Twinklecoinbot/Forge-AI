import Editor, { loader } from '@monaco-editor/react';
import { X } from 'lucide-react';
import { useForge } from '../store/ForgeContext.jsx';
import { languageFromPath } from '../services/fileParser.js';
import { defineForgeThemes } from '../monaco.js';

loader.init().then((monaco) => {
  defineForgeThemes(monaco);
});

export default function EditorPane() {
  const { files, openTabs, setOpenTabs, activeFile, setActiveFile, updateFileContent, theme } = useForge();
  const current = files.find((f) => f.path === activeFile);
  return (
    <div className="flex min-w-0 flex-1 flex-col bg-[var(--bg)]">
      <div className="flex h-9 items-center overflow-x-auto border-b border-[var(--border)] bg-[var(--bg-panel)]">
        {openTabs.map((path) => (
          <button
            key={path}
            onClick={() => setActiveFile(path)}
            className={`group flex items-center gap-2 border-r border-[var(--border)] px-3 py-2 text-[12px] ${
              path === activeFile ? 'bg-[var(--bg)]' : 'text-[var(--text-muted)]'
            }`}
          >
            <span className="max-w-[180px] truncate">{path.split('/').pop()}</span>
            <X
              size={12}
              className="opacity-0 group-hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation();
                const next = openTabs.filter((t) => t !== path);
                setOpenTabs(next);
                if (activeFile === path) setActiveFile(next.at(-1) || null);
              }}
            />
          </button>
        ))}
      </div>
      {current ? (
        <Editor
          height="100%"
          theme={theme === 'dark' ? 'forge-dark' : 'forge-light'}
          language={languageFromPath(current.path)}
          value={current.content}
          onChange={(v) => updateFileContent(current.path, v ?? '')}
          beforeMount={defineForgeThemes}
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            fontFamily: "'JetBrains Mono', 'Cascadia Code', Consolas, 'Courier New', monospace",
            fontLigatures: true,
            lineNumbers: 'on',
            renderLineHighlight: 'line',
            automaticLayout: true,
            scrollBeyondLastLine: false,
            padding: { top: 8 },
            bracketPairColorization: { enabled: true }
          }}
        />
      ) : (
        <div className="grid flex-1 place-items-center text-[13px] text-[var(--text-muted)]">
          Open a file or generate a project.
        </div>
      )}
    </div>
  );
}
