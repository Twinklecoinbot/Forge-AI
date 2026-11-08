import { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, RefreshCw } from 'lucide-react';
import { useForge } from '../store/ForgeContext.jsx';
import { previewHtml } from '../services/fileParser.js';
import { probeLiveUrl } from '../services/githubService.js';

export default function BrowserPane() {
  const { files, browserUrl, setBrowserUrl, activeProject, setView, setWorkspaceMode, showToast } = useForge();
  const generated = useMemo(() => previewHtml(files), [files]);
  const projectLive = activeProject?.liveUrl || activeProject?.githubRepo?.live || '';
  const projectPreview = activeProject?.previewUrl || '';
  const [draft, setDraft] = useState(browserUrl || projectLive || projectPreview || '');
  const [frameKey, setFrameKey] = useState(0);
  const [liveOk, setLiveOk] = useState(false);
  const frameRef = useRef(null);

  // Refresh local blob preview whenever project files change
  useEffect(() => {
    if (!files?.length) return;
    const html = generated;
    if (!html) return;
    try {
      if (window.__forgePreviewUrl) URL.revokeObjectURL(window.__forgePreviewUrl);
    } catch {
      /* ignore */
    }
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    window.__forgePreviewUrl = url;
    // If we're not on a working live URL, keep Generated preview interactive
    if (!liveOk || !projectLive) {
      setBrowserUrl(url);
      setDraft(url);
      setFrameKey((k) => k + 1);
    }
  }, [files, activeProject?.arrangedAt, activeProject?.id]);

  useEffect(() => {
    const next = browserUrl || (liveOk ? projectLive : '') || projectPreview || '';
    setDraft(next);
  }, [browserUrl, projectLive, projectPreview, liveOk, activeProject?.id]);

  // Probe live Pages URL — avoid showing GitHub's 404 shell in Preview
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!projectLive) {
        setLiveOk(false);
        return;
      }
      const ok = await probeLiveUrl(projectLive);
      if (cancelled) return;
      setLiveOk(ok);
      if (ok) {
        setBrowserUrl(projectLive);
        setDraft(projectLive);
        setFrameKey((k) => k + 1);
      } else if (generated) {
        showToast?.('Live Pages still building — showing Generated preview');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectLive, activeProject?.id, activeProject?.arrangedAt]);

  const go = (url) => {
    const next = String(url || '').trim();
    setBrowserUrl(next);
    setDraft(next);
    setFrameKey((k) => k + 1);
    setWorkspaceMode('browser');
    setView('browser');
  };

  const showGenerated = () => {
    if (!generated) {
      go('');
      return;
    }
    try {
      if (window.__forgePreviewUrl) URL.revokeObjectURL(window.__forgePreviewUrl);
    } catch {
      /* ignore */
    }
    const url = URL.createObjectURL(new Blob([generated], { type: 'text/html' }));
    window.__forgePreviewUrl = url;
    go(url);
  };

  const openOutside = () => {
    const target = (liveOk && projectLive) || draft || browserUrl || projectPreview;
    if (!target || String(target).startsWith('blob:')) {
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

  const onFrameLoad = () => {
    try {
      const doc = frameRef.current?.contentDocument;
      if (!doc) return;
      if (!doc.querySelector('base[data-forge]')) {
        const base = doc.createElement('base');
        base.target = '_self';
        base.setAttribute('data-forge', '1');
        doc.head?.prepend(base);
      }
    } catch {
      /* cross-origin live pages */
    }
  };

  const externalHref =
    (liveOk && projectLive) ||
    (draft && !String(draft).startsWith('blob:') ? draft : '') ||
    (browserUrl && !String(browserUrl).startsWith('blob:') ? browserUrl : '');

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
          value={
            draft && !String(draft).startsWith('blob:')
              ? draft
              : liveOk && projectLive
                ? projectLive
                : 'local://generated-preview'
          }
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
          className={`rounded-md border px-3 py-1.5 text-[12px] ${
            !liveOk || String(browserUrl || '').startsWith('blob:')
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
              : 'border-[var(--border)]'
          }`}
          onClick={showGenerated}
        >
          Generated
        </button>
        {projectLive ? (
          <button
            type="button"
            className={`rounded-md border px-3 py-1.5 text-[12px] ${
              liveOk ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200' : 'border-[var(--border)] opacity-70'
            }`}
            title={liveOk ? projectLive : 'Pages still building / 404'}
            onClick={async () => {
              const ok = await probeLiveUrl(projectLive);
              setLiveOk(ok);
              if (ok) go(projectLive);
              else {
                showToast?.('Live URL not ready yet (Pages 404). Showing Generated.');
                showGenerated();
              }
            }}
          >
            Live{liveOk ? '' : '…'}
          </button>
        ) : null}
        <button
          type="button"
          title={externalHref || 'Open outside'}
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
