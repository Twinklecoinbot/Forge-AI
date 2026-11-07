import { useEffect, useRef } from 'react';
import { Check, CheckCircle2, Circle, FileCode2, Loader2, ThumbsDown, ThumbsUp, X } from 'lucide-react';
import { useForge } from '../store/ForgeContext.jsx';
import { attachmentKindMeta, stripCodePayloads } from '../services/chatPresentation.js';
import Composer from './Composer.jsx';

export default function AgentView() {
  const {
    activeChat,
    busy,
    setView,
    setActiveFile,
    setOpenTabs,
    setWorkspaceMode,
    submitFeedback,
    learningBusy
  } = useForge();
  const endRef = useRef(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeChat?.messages, busy]);

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <div className="forge-scroll flex-1">
        <div className="mx-auto w-full max-w-[760px] space-y-4 px-5 py-8">
          {(activeChat?.messages || []).map((message, index) => {
            const isLast = index === (activeChat?.messages?.length || 0) - 1;
            const streaming = busy && isLast && message.role === 'assistant' && !message.deliveryComplete;
            return (
              <div key={message.id} className="forge-fade">
                {message.role === 'user' ? (
                  <UserCard message={message} />
                ) : (
                  <AssistantCard
                    message={message}
                    streaming={streaming}
                    learningBusy={learningBusy}
                    onAccept={() => submitFeedback(message, 'accepted')}
                    onReject={() => submitFeedback(message, 'rejected')}
                    onOpenFile={(path) => {
                      setActiveFile(path);
                      setOpenTabs((tabs) => (tabs.includes(path) ? tabs : [...tabs, path]));
                      setWorkspaceMode('code');
                      setView('workspace');
                    }}
                    onOpenCode={() => {
                      setWorkspaceMode('code');
                      setView('workspace');
                    }}
                  />
                )}
              </div>
            );
          })}
          <div ref={endRef} />
        </div>
      </div>
      <div className="flex justify-center px-5 pb-5">
        <Composer />
      </div>
    </div>
  );
}

function UserCard({ message }) {
  return (
    <div className="ml-8 rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3 shadow-sm">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">You</div>
      {message.attachments?.length ? (
        <div className="mb-3 flex flex-wrap gap-2">
          {message.attachments.map((file) => (
            <AttachmentChip key={file.id || file.name} file={file} />
          ))}
        </div>
      ) : null}
      <div className="whitespace-pre-wrap text-[14.5px] leading-7 text-[var(--text)]">{message.content}</div>
    </div>
  );
}

function AssistantCard({ message, streaming, learningBusy, onAccept, onReject, onOpenFile, onOpenCode }) {
  const progress = message.progress || {};
  const prose = stripCodePayloads(message.content || '');
  const files = message.files || [];

  return (
    <div className="mr-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-panel)] px-4 py-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          <span>Forge</span>
          {streaming && (
            <span className="inline-flex items-center gap-1 normal-case tracking-normal text-emerald-400">
              <Loader2 size={12} className="animate-spin" /> Working…
            </span>
          )}
          {message.deliveryComplete && !message.error && (
            <span className="inline-flex items-center gap-1 normal-case tracking-normal text-emerald-400">
              <CheckCircle2 size={12} /> Complete
            </span>
          )}
        </div>
        {message.role === 'assistant' && !message.error && message.deliveryComplete && (
          <div className="flex items-center gap-1">
            <button
              disabled={learningBusy || message.feedback === 'accepted'}
              onClick={onAccept}
              className={`inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-1 text-[11px] disabled:opacity-40 ${
                message.feedback === 'accepted' ? 'bg-emerald-500/15 text-emerald-300' : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)]'
              }`}
            >
              {message.feedback === 'accepted' ? <Check size={12} /> : <ThumbsUp size={12} />}
              Accept
            </button>
            <button
              disabled={message.feedback === 'rejected'}
              onClick={onReject}
              className={`inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-1 text-[11px] disabled:opacity-40 ${
                message.feedback === 'rejected' ? 'bg-red-500/15 text-red-300' : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)]'
              }`}
            >
              {message.feedback === 'rejected' ? <X size={12} /> : <ThumbsDown size={12} />}
              Reject
            </button>
          </div>
        )}
      </div>

      {progress.stages?.length ? (
        <div className="mb-3 space-y-1.5 rounded-xl border border-[var(--border)] bg-[var(--bg)]/50 p-3">
          {progress.stages.map((stage) => (
            <div key={stage.id} className="flex items-center gap-2 text-[12.5px]">
              {stage.status === 'done' ? (
                <CheckCircle2 size={14} className="text-emerald-400" />
              ) : stage.status === 'active' ? (
                <Loader2 size={14} className="animate-spin text-sky-400" />
              ) : (
                <Circle size={14} className="text-[var(--text-muted)]" />
              )}
              <span className={stage.status === 'active' ? 'text-[var(--text)]' : 'text-[var(--text-muted)]'}>{stage.label}</span>
            </div>
          ))}
        </div>
      ) : null}

      {message.error ? (
        <div className="whitespace-pre-wrap text-[14px] leading-6 text-red-400">{message.content}</div>
      ) : prose ? (
        <div className="mb-3 whitespace-pre-wrap text-[14px] leading-6 text-[var(--text)]">{prose}</div>
      ) : streaming ? (
        <div className="mb-3 text-[13px] text-[var(--text-muted)]">Building in the background — progress updates as files land in Code…</div>
      ) : null}

      {files.length > 0 && (
        <div className="mb-3 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-[12px] text-[var(--text-muted)]">
              {streaming ? 'Writing to Code…' : `${files.length} file${files.length === 1 ? '' : 's'} in Code`}
            </div>
            {!streaming && (
              <button onClick={onOpenCode} className="text-[11px] text-sky-300 underline">
                Open Code tab
              </button>
            )}
          </div>
          <div className="grid gap-1">
            {files.slice(0, 10).map((file) => (
              <button
                key={file.path}
                onClick={() => onOpenFile(file.path)}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] hover:bg-[var(--bg-hover)]"
              >
                <FileCode2 size={14} className="text-[var(--text-muted)]" />
                <span className="truncate">{file.path}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {message.deliveryComplete && (progress.done?.length || progress.next?.length) ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-400">Done</div>
            <ul className="space-y-1 text-[12.5px] leading-5 text-[var(--text)]">
              {(progress.done || []).map((item) => (
                <li key={item}>• {item}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-3">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-sky-300">Next steps</div>
            <ul className="space-y-1 text-[12.5px] leading-5 text-[var(--text)]">
              {(progress.next || []).map((item) => (
                <li key={item}>• {item}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AttachmentChip({ file }) {
  const meta = attachmentKindMeta(file);
  return (
    <span className={`inline-flex max-w-full items-center gap-2 rounded-xl border px-2.5 py-1.5 text-[11px] ${meta.color}`}>
      {file.kind === 'image' && file.dataUrl ? (
        <img src={file.dataUrl} alt="" className="h-8 w-8 rounded object-cover" />
      ) : (
        <span className="grid h-8 w-8 place-items-center rounded-md bg-black/20 text-[10px] font-bold">{meta.badge}</span>
      )}
      <span className="min-w-0">
        <span className="block truncate font-medium">{file.name}</span>
        <span className="block text-[10px] opacity-80">{file.previewNote || meta.label}{file.size ? ` · ${formatSize(file.size)}` : ''}</span>
      </span>
    </span>
  );
}

function formatSize(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
