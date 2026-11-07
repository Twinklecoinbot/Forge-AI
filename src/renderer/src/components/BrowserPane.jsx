import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, RefreshCw } from 'lucide-react';
import { useForge } from '../store/ForgeContext.jsx';
import { previewHtml } from '../services/fileParser.js';

export default function BrowserPane() {
  const { files, browserUrl, setBrowserUrl, activeProject } = useForge();
  const generated = useMemo(() => previewHtml(files), [files]);
  const projectLive = activeProject?.githubRepo?.live || '';
  const [draft, setDraft] = useState(browserUrl || projectLive || '');
  const [frameKey, setFrameKey] = useState(0);
  useEffect(() => { setDraft(browserUrl || projectLive || ''); }, [browserUrl, projectLive]);
  const go = (url) => { setBrowserUrl(String(url || '').trim()); setFrameKey((k) => k + 1); };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <form className="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--bg-panel)] px-3 py-2" onSubmit={(e) => { e.preventDefault(); go(draft); }}>
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="https://… or leave empty for generated HTML" className="flex-1 rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 text-[12.5px] outline-none" />
        <button className="rounded-md border border-[var(--border)] px-3 py-1.5 text-[12px]" type="submit">Go</button>
        <button type="button" className="rounded-md border border-[var(--border)] px-3 py-1.5" onClick={() => setFrameKey((k) => k + 1)}><RefreshCw size={13} /></button>
        <button type="button" className="rounded-md border border-[var(--border)] px-3 py-1.5 text-[12px]" onClick={() => go('')}>Generated</button>
        {projectLive && <button type="button" className="rounded-md border border-[var(--border)] px-3 py-1.5 text-[12px]" onClick={() => go(projectLive)}>Live</button>}
        {(browserUrl || projectLive) && (
          <a href={browserUrl || projectLive} target="_blank" rel="noreferrer" className="grid h-8 w-8 place-items-center rounded-md border border-[var(--border)]"><ExternalLink size={13} /></a>
        )}
      </form>
      {browserUrl ? (
        <iframe key={frameKey} title="preview" className="min-h-0 flex-1 bg-white" src={browserUrl} />
      ) : generated ? (
        <iframe key={`g-${frameKey}`} title="preview" className="min-h-0 flex-1 bg-white" srcDoc={generated} />
      ) : (
        <div className="grid flex-1 place-items-center text-[13px] text-[var(--text-muted)]">Generate index.html or publish a live GitHub Pages link.</div>
      )}
    </div>
  );
}
