import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Mic, Paperclip, Plus, Square, X } from 'lucide-react';
import { useForge } from '../store/ForgeContext.jsx';
import { attachmentKindMeta } from '../services/chatPresentation.js';

const SKILLS = [
  { cmd: '/plan', desc: 'Architecture first' },
  { cmd: '/build', desc: 'Generate complete files' },
  { cmd: '/review', desc: 'Review and patch' },
  { cmd: '/debug', desc: 'Find and fix bugs' },
  { cmd: '/deploy', desc: 'Prepare hosting files' }
];

export default function Composer({ compact = false }) {
  const {
    composer,
    setComposer,
    sendPrompt,
    busy,
    settings,
    saveSettings,
    models,
    stop,
    files,
    attachedPaths,
    setAttachedPaths,
    attachments,
    setAttachments,
    attachComposerFiles
  } = useForge();
  const [skillOpen, setSkillOpen] = useState(false);
  const [atOpen, setAtOpen] = useState(false);
  const fileRef = useRef(null);
  const listening = useRef(null);

  useEffect(() => {
    setSkillOpen(/^\/[a-z]*$/.test(composer));
    setAtOpen(/(^|\s)@[\w./-]*$/.test(composer));
  }, [composer]);

  const onKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendPrompt();
    }
  };

  const onPaste = (e) => {
    const files = [...(e.clipboardData?.items || [])]
      .filter((i) => i.kind === 'file')
      .map((i) => i.getAsFile())
      .filter(Boolean);
    if (files.length) {
      e.preventDefault();
      attachComposerFiles(files);
    }
  };

  const startMic = () => {
    const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Speech) return;
    if (listening.current) {
      listening.current.stop();
      listening.current = null;
      return;
    }
    const rec = new Speech();
    rec.lang = 'en-US';
    rec.onresult = (event) => setComposer((c) => (c ? `${c} ${event.results[0][0].transcript}` : event.results[0][0].transcript));
    rec.onend = () => {
      listening.current = null;
    };
    listening.current = rec;
    rec.start();
  };

  const canSend = Boolean(composer.trim() || attachments.length);

  return (
    <div className={`relative ${compact ? '' : 'w-full max-w-[760px]'}`}>
      {skillOpen && (
        <div className="absolute bottom-[calc(100%+8px)] left-0 right-0 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] shadow-2xl">
          {SKILLS.filter((s) => s.cmd.startsWith(composer.trim() || '/')).map((skill) => (
            <button
              key={skill.cmd}
              onClick={() => setComposer(`${skill.cmd} `)}
              className="flex w-full gap-3 px-3 py-2 text-left text-[12px] hover:bg-[var(--bg-hover)]"
            >
              <span className="font-mono">{skill.cmd}</span>
              <span className="text-[var(--text-muted)]">{skill.desc}</span>
            </button>
          ))}
        </div>
      )}
      {atOpen && files.length > 0 && (
        <div className="absolute bottom-[calc(100%+8px)] left-0 right-0 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] shadow-2xl">
          {files.slice(0, 8).map((file) => (
            <button
              key={file.path}
              onClick={() => {
                setAttachedPaths((p) => (p.includes(file.path) ? p : [...p, file.path]));
                setComposer((c) => c.replace(/@[\w./-]*$/, ''));
              }}
              className="block w-full truncate px-3 py-2 text-left text-[12.5px] hover:bg-[var(--bg-hover)]"
            >
              {file.path}
            </button>
          ))}
        </div>
      )}
      <div
        className="forge-composer rounded-2xl px-4 py-3"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (e.dataTransfer.files?.length) attachComposerFiles([...e.dataTransfer.files]);
        }}
      >
        {(attachments.length > 0 || attachedPaths.length > 0) && (
          <div className="mb-2 flex flex-wrap gap-2">
            {attachments.map((file) => {
              const meta = attachmentKindMeta(file);
              return (
                <span
                  key={file.id}
                  className={`inline-flex max-w-[220px] items-center gap-2 rounded-xl border px-2 py-1.5 text-[11px] ${meta.color}`}
                >
                  <button
                    type="button"
                    className="inline-flex min-w-0 flex-1 items-center gap-2 text-left"
                    title="View attachment"
                    onClick={() => {
                      if (file.kind === 'image' && file.dataUrl) {
                        const w = window.open('', '_blank');
                        if (w) {
                          w.document.write(
                            `<title>${file.name || 'image'}</title><img src="${file.dataUrl}" style="max-width:100%;height:auto;background:#111"/>`
                          );
                        }
                      } else if (file.content) {
                        const w = window.open('', '_blank');
                        if (w) {
                          w.document.write(
                            `<pre style="white-space:pre-wrap;padding:16px;background:#111;color:#eee">${String(file.content)
                              .replace(/&/g, '&amp;')
                              .replace(/</g, '&lt;')}</pre>`
                          );
                        }
                      }
                    }}
                  >
                    {file.kind === 'image' && file.dataUrl ? (
                      <img src={file.dataUrl} alt="" className="h-9 w-9 rounded object-cover" />
                    ) : (
                      <span className="grid h-9 w-9 place-items-center rounded-md bg-black/25 text-[10px] font-bold">
                        {meta.badge}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium underline-offset-2 hover:underline">{file.name}</span>
                      <span className="block text-[10px] opacity-80">{file.previewNote || meta.label}</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    title="Copy"
                    className="opacity-70 hover:opacity-100"
                    onClick={async () => {
                      try {
                        if (file.kind === 'image' && file.dataUrl && navigator.clipboard?.write) {
                          const blob = await (await fetch(file.dataUrl)).blob();
                          await navigator.clipboard.write([new ClipboardItem({ [blob.type || 'image/png']: blob })]);
                        } else {
                          await navigator.clipboard.writeText(file.content || file.name || '');
                        }
                      } catch {
                        /* ignore */
                      }
                    }}
                  >
                    Copy
                  </button>
                  <button onClick={() => setAttachments((a) => a.filter((x) => x.id !== file.id))} className="opacity-70 hover:opacity-100">
                    <X size={12} />
                  </button>
                </span>
              );
            })}
            {attachedPaths.map((path) => (
              <button
                key={path}
                onClick={() => setAttachedPaths((p) => p.filter((x) => x !== path))}
                className="rounded-full border border-[var(--border)] bg-[var(--bg-hover)] px-2 py-0.5 text-[11px] text-[var(--text-muted)]"
              >
                @{path.split('/').pop()}
              </button>
            ))}
          </div>
        )}
        <textarea
          value={composer}
          onChange={(e) => setComposer(e.target.value)}
          onKeyDown={onKey}
          onPaste={onPaste}
          rows={compact ? 3 : 4}
          placeholder="Describe the app — Agent builds files, Preview, and can /deploy to GitHub"
          className="w-full resize-none bg-transparent text-[14.5px] leading-6 outline-none placeholder:text-[var(--text-muted)]"
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-1 text-[var(--text-muted)]">
            <button className="grid h-8 w-8 place-items-center rounded-md hover:bg-[var(--bg-hover)]" onClick={() => fileRef.current?.click()}>
              <Plus size={16} />
            </button>
            <button
              className="grid h-8 w-8 place-items-center rounded-md hover:bg-[var(--bg-hover)]"
              onClick={() => setComposer((c) => `${c}${c && !c.endsWith(' ') ? ' ' : ''}@`)}
            >
              <Paperclip size={15} />
            </button>
            <input
              ref={fileRef}
              type="file"
              multiple
              accept="image/*,.zip,.js,.jsx,.ts,.tsx,.json,.css,.html,.md,.py,.txt,.svg"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) attachComposerFiles([...e.target.files]);
                e.target.value = '';
              }}
            />
          </div>
          <div className="flex items-center gap-2">
            <select
              value={settings.model}
              onChange={(e) => saveSettings({ model: e.target.value })}
              className="max-w-[190px] rounded-md bg-transparent px-2 py-1 text-[12px] text-[var(--text-muted)] outline-none"
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
            <button className="grid h-8 w-8 place-items-center rounded-md hover:bg-[var(--bg-hover)]" onClick={startMic}>
              <Mic size={15} />
            </button>
            <button
              onClick={() => (busy ? stop() : sendPrompt())}
              disabled={!busy && !canSend}
              className="grid h-8 w-8 place-items-center rounded-full bg-[var(--text)] text-[var(--bg)] disabled:opacity-40"
            >
              {busy ? <Square size={12} /> : <ArrowUp size={16} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
