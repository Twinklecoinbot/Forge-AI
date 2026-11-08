import { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, RefreshCw } from 'lucide-react';
import { useForge } from '../store/ForgeContext.jsx';
import { previewHtml } from '../services/fileParser.js';

export default function BrowserPane() {
  const { files, browserUrl, setBrowserUrl, activeProject, setView, setWorkspaceMode } = useForge();
  const generated = useMemo(() => previewHtml(files), [files]);
  const projectLive =
    activeProject?.liveUrl || activeProject?.githubRepo?.live || activeProject?.githubRepo?.html_url || '';
  const projectPreview = activeProject?.previewUrl || '';
  const latestUrl = browserUrl || projectLive || projectPreview || '';
  const [draft, setDraft] = useState(latestUrl);
  const [frameKey, setFrameKey] = useState(0);
  const frameRef = useRef(null);

  useEffect(() => {
    const next = browserUrl || projectLive || projectPreview || '';
    setDraft(next);
  }, [browserUrl, projectLive, projectPreview, activeProject?.id, activeProject?.arrangedAt]);

  // When this project's live URL appears/updates, point Preview at it
  useEffect(() => {
    if (!projectLive) return;
    setBrowserUrl(projectLive);
    setDraft(projectLive);
    setFrameKey((k) => k + 1);
  }, [activeProject?.id, projectLive]);

  const go = (url) => {
    const next = String(url || '').trim();
    setBrowserUrl(next);
    setDraft(next);
    setFrameKey((k) => k + 1);
    setWorkspaceMode('browser');
    setView('browser');
  };

  const openOutside = () => {
    const target = draft || browserUrl || projectLive || projectPreview;
    if (!target || String(target).startsWith('blob:')) {
      // Open generated HTML in a real window
      if (!generated) return;
      const w = window.open('', '_blank');
      if (w) {
        w.document.open();
        w.document.write(generated);
        w.document.close();
      }
      return;
    }
    window.open(target, '_blank', 'noopener,noreferrer');
  };

  const showGenerated = () => {
    // Force local generated preview from current project files
    const html = generated;
    if (!html) {
      setBrowserUrl('');
      setDraft('');
      setFrameKey((k) => k + 1);
      return;
    }
    try {
      if (window.__forgePreviewUrl) URL.revokeObjectURL(window.__forgePreviewUrl);
    } catch {
      /* ignore */
    }
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    window.__forgePreviewUrl = url;
    go(url);
  };

  const onFrameLoad = () => {
    // Same-origin / srcDoc only — keep clicks inside the preview
    try {
      const doc = frameRef.current?.contentDocument;
      if (!doc) return;
      if (!doc.querySelector('base[data-forge]')) {
        const base = doc.createElement('base');
        base.target = '_self';
        base.setAttribute('data-forge', '1');
        doc.head?.prepend(base);
      }
      doc.addEventListener(
        'click',
        (e) => {
          const a = e.target?.closest?.('a');
          if (!a) return;
          const href = a.getAttribute('href') || '';
          if (/^(https?:|mailto:|tel:)/i.test(href)) {
            // stay in iframe for http(s); only block top navigation
            a.setAttribute('target', '_self');
          }
        },
        true
      );
    } catch {
      /* cross-origin live pages — interaction stays in iframe by default */
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <form
        className="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--bg-panel)] px-3 py-2"
        onSubmit={(e) => {
          e.preventDefault();
          go(draft);
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Preview URL for this project"
          className="flex-1 rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 text-[12.5px] outline-none"
        />
        <button className="rounded-md border border-[var(--border)] px-3 py-1.5 text-[12px]" type="submit">
          Go
        </button>
        <button
          type="button"
          className="rounded-md border border-[var(--border)] px-3 py-1.5"
          onClick={() => setFrameKey((k) => k + 1)}
          title="Refresh"
        >
          <RefreshCw size={13} />
        </button>
        <button
          type="button"
          className="rounded-md border border-[var(--border)] px-3 py-1.5 text-[12px]"
          onClick={showGenerated}
        >
          Generated
        </button>
        {projectLive ? (
          <button
            type="button"
            className="rounded-md border border-[var(--border)] px-3 py-1.5 text-[12px]"
            onClick={() => go(projectLive)}
          >
            Live
          </button>
        ) : null}
        <button
          type="button"
          title="Open outside"
          onClick={openOutside}
          className="grid h-8 w-8 place-items-center rounded-md border border-[var(--border)]"
        >
          <ExternalLink size={13} />
        </button>
      </form>
      {browserUrl ? (
        <iframe
          ref={frameRef}
          key={frameKey}
          title="preview"
          className="min-h-0 flex-1 bg-white"
          src={browserUrl}
          onLoad={onFrameLoad}
          sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-modals allow-downloads"
          referrerPolicy="no-referrer-when-downgrade"
        />
      ) : generated ? (
        <iframe
          ref={frameRef}
          key={`g-${frameKey}`}
          title="preview"
          className="min-h-0 flex-1 bg-white"
          srcDoc={generated}
          onLoad={onFrameLoad}
          sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-modals"
        />
      ) : (
        <div className="grid flex-1 place-items-center text-[13px] text-[var(--text-muted)]">
          Generate index.html or publish a live GitHub Pages link.
        </div>
      )}
    </div>
  );
}
