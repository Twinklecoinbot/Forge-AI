import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  CheckCircle2,
  ChevronDown,
  Circle,
  Copy,
  GitCommitHorizontal,
  Loader2,
  Pencil,
  Terminal,
  ThumbsDown,
  ThumbsUp,
  X
} from 'lucide-react';
import { useForge } from '../store/ForgeContext.jsx';
import { attachmentKindMeta } from '../services/chatPresentation.js';
import FileIcon from './FileIcon.jsx';
import Composer from './Composer.jsx';

export default function AgentView() {
  const {
    activeChat,
    busy,
    setView,
    setActiveFile,
    setOpenTabs,
    setWorkspaceMode,
    setBrowserUrl,
    setTerminalOpen,
    submitFeedback,
    learningBusy,
    editUserMessage,
    publishToGithub,
    activeProject,
    showToast,
    settings
  } = useForge();
  const endRef = useRef(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeChat?.messages, busy]);

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <div className="forge-scroll flex-1">
        <div className="mx-auto w-full max-w-[760px] space-y-5 px-5 py-8">
          {(activeChat?.messages || []).map((message, index) => {
            const isLast = index === (activeChat?.messages?.length || 0) - 1;
            const streaming = busy && isLast && message.role === 'assistant' && !message.deliveryComplete;
            return (
              <div key={message.id} className="forge-fade">
                {message.role === 'user' ? (
                  <UserCard message={message} onEdit={() => editUserMessage(message)} />
                ) : (
                  <AssistantReply
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
                    onOpenPreview={() => {
                      if (message.previewUrl) setBrowserUrl(message.previewUrl);
                      setWorkspaceMode('browser');
                      setView('browser');
                    }}
                    onOpenTerminal={() => {
                      setTerminalOpen(true);
                      setView('workspace');
                    }}
                    onCommitPush={async () => {
                      if (!settings.githubToken) {
                        showToast('Connect GitHub in Customize first');
                        setView('github');
                        return;
                      }
                      try {
                        const name = (activeProject?.name || 'forge-app')
                          .toLowerCase()
                          .replace(/[^a-z0-9]+/g, '-')
                          .slice(0, 48);
                        const result = await publishToGithub({
                          name,
                          isPrivate: false,
                          fileOverride: message.files?.length ? message.files : undefined
                        });
                        showToast(`Pushed · ${result.live}`);
                      } catch (e) {
                        showToast(e.message);
                      }
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

function UserCard({ message, onEdit }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message.content || '');
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };
  return (
    <div className="ml-8">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3 shadow-sm">
        {message.attachments?.length ? (
          <div className="mb-3 flex flex-wrap gap-2">
            {message.attachments.map((file) => (
              <AttachmentChip key={file.id || file.name} file={file} />
            ))}
          </div>
        ) : null}
        <div className="whitespace-pre-wrap text-[14.5px] leading-7 text-[var(--text)]">{message.content}</div>
      </div>
      <div className="mt-1.5 flex items-center gap-1 px-1">
        <IconAction icon={Copy} label={copied ? 'Copied' : 'Copy'} onClick={copy} />
        <IconAction icon={Pencil} label="Edit" onClick={onEdit} />
      </div>
    </div>
  );
}

function AssistantReply({
  message,
  streaming,
  learningBusy,
  onAccept,
  onReject,
  onOpenFile,
  onOpenCode,
  onOpenPreview,
  onOpenTerminal,
  onCommitPush
}) {
  const progress = message.progress || {};
  const files = message.files || [];
  const changes = message.changes || [];
  const totals = useMemo(() => {
    const list = changes.length
      ? changes
      : files.map((f) => ({
          path: f.path,
          added: String(f.content || '').split('\n').length,
          removed: 0,
          language: (f.path.split('.').pop() || 'FILE').toUpperCase().slice(0, 4)
        }));
    return {
      list,
      added: list.reduce((a, c) => a + (c.added || 0), 0),
      removed: list.reduce((a, c) => a + (c.removed || 0), 0)
    };
  }, [changes, files]);

  // Cursor-style: during execute streaming show status only (stages), not raw model text
  const prose =
    message.mode === 'guide'
      ? message.display || message.content || ''
      : streaming
        ? message.display || 'Working…'
        : message.display || '';

  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(prose || '');
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="mr-2">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
          {streaming ? (
            <span className="inline-flex items-center gap-1">
              <Loader2 size={12} className="animate-spin text-emerald-400" />
              Working…
            </span>
          ) : message.deliveryComplete && !message.error ? (
            <span className="inline-flex items-center gap-1">
              <CheckCircle2 size={12} className="text-emerald-400" />
              {message.mode === 'guide' ? 'Answered' : 'Built'}
            </span>
          ) : null}
        </div>
        {message.deliveryComplete && !message.error && message.mode !== 'guide' && (
          <div className="flex items-center gap-1">
            <button
              disabled={learningBusy || message.feedback === 'accepted'}
              onClick={onAccept}
              className={`inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-1 text-[11px] disabled:opacity-40 ${
                message.feedback === 'accepted'
                  ? 'bg-emerald-500/15 text-emerald-300'
                  : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)]'
              }`}
            >
              {message.feedback === 'accepted' ? <Check size={12} /> : <ThumbsUp size={12} />}
            </button>
            <button
              disabled={message.feedback === 'rejected'}
              onClick={onReject}
              className={`inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-1 text-[11px] disabled:opacity-40 ${
                message.feedback === 'rejected'
                  ? 'bg-red-500/15 text-red-300'
                  : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)]'
              }`}
            >
              {message.feedback === 'rejected' ? <X size={12} /> : <ThumbsDown size={12} />}
            </button>
          </div>
        )}
      </div>

      {/* Cursor-style stage list */}
      {progress.stages?.length ? (
        <div className="mb-3 space-y-1.5 py-1">
          {progress.stages.map((stage) => (
            <div key={stage.id} className="flex items-center gap-2 text-[12.5px]">
              {stage.status === 'done' ? (
                <CheckCircle2 size={14} className="text-emerald-400" />
              ) : stage.status === 'active' ? (
                <Loader2 size={14} className="animate-spin text-sky-400" />
              ) : (
                <Circle size={14} className="text-[var(--text-muted)]" />
              )}
              <span className={stage.status === 'active' ? 'text-[var(--text)]' : 'text-[var(--text-muted)]'}>
                {stage.label}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {message.activity ? (
        <div className="mb-2 text-[12px] text-[var(--text-muted)]">
          <DiffColoredText text={message.activity} />
        </div>
      ) : null}

      {message.error ? (
        <div className="mb-3 whitespace-pre-wrap text-[14px] leading-6 text-red-400">{prose || message.content}</div>
      ) : prose ? (
        <div className="mb-3 whitespace-pre-wrap text-[14px] leading-6 text-[var(--text)]">
          <RichText text={prose} />
        </div>
      ) : streaming ? (
        <div className="mb-3 text-[13px] text-[var(--text-muted)]">Building in the background…</div>
      ) : null}

      {message.previewUrl && message.deliveryComplete && !message.error ? (
        <button
          type="button"
          onClick={onOpenPreview}
          className="mb-2 block text-left text-[13px] text-sky-300 underline"
        >
          Preview → {shortUrl(message.previewUrl)}
        </button>
      ) : null}

      {message.deployResult?.live && message.deliveryComplete ? (
        <a
          href={message.deployResult.live}
          target="_blank"
          rel="noreferrer"
          className="mb-2 block text-[13px] text-emerald-400 underline"
        >
          Live → {shortUrl(message.deployResult.live)}
        </a>
      ) : null}

      {/* Files Changed — Cursor style */}
      {(totals.list.length > 0 || files.length > 0) && !streaming && message.mode !== 'guide' ? (
        <div className="mb-3 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-panel)]">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2">
            <div className="text-[12.5px] font-medium">
              {totals.list.length || files.length} File
              {(totals.list.length || files.length) === 1 ? '' : 's'} Changed
            </div>
            <button type="button" onClick={onOpenCode} className="text-[12px] text-sky-300 hover:underline">
              Review
            </button>
          </div>
          <div className="divide-y divide-[var(--border)]">
            {totals.list.slice(0, 16).map((row) => (
              <button
                key={row.path}
                type="button"
                onClick={() => onOpenFile(row.path)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12.5px] hover:bg-[var(--bg-hover)]"
              >
                <FileIcon path={row.path} className="h-4 w-4" />
                <span className="min-w-0 flex-1 truncate">{row.path}</span>
                <span className="shrink-0 tabular-nums text-[12px]">
                  {row.added ? <span className="text-emerald-400">+{row.added}</span> : null}
                  {row.added && row.removed ? ' ' : null}
                  {row.removed ? <span className="text-red-400">-{row.removed}</span> : null}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* Action bar like Cursor */}
      {message.deliveryComplete && message.mode !== 'guide' && (totals.added || files.length) ? (
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onOpenCode}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-1.5 text-[12px]"
          >
            Changes{' '}
            <span className="text-emerald-400">+{totals.added || files.length}</span>
            {totals.removed ? <span className="text-red-400">-{totals.removed}</span> : null}
          </button>
          <button
            type="button"
            onClick={onOpenTerminal}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-1.5 text-[12px]"
          >
            <Terminal size={12} /> 1 Terminal
          </button>
          <button
            type="button"
            onClick={onCommitPush}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-1.5 text-[12px]"
          >
            <GitCommitHorizontal size={12} /> Commit & Push <ChevronDown size={12} />
          </button>
        </div>
      ) : null}

      {(prose || message.deliveryComplete) && !message.error ? (
        <div className="mt-1 flex items-center gap-1">
          <IconAction icon={Copy} label={copied ? 'Copied' : 'Copy'} onClick={copy} />
        </div>
      ) : null}
    </div>
  );
}

function RichText({ text }) {
  const parts = String(text || '').split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          const inner = part.slice(2, -2);
          const diffClass = diffToneClass(inner);
          return (
            <strong key={i} className={`font-semibold ${diffClass || 'text-[var(--text)]'}`}>
              {inner}
            </strong>
          );
        }
        if (part.startsWith('`') && part.endsWith('`')) {
          return (
            <code key={i} className="rounded bg-[var(--bg-hover)] px-1 py-0.5 text-[12.5px] text-sky-300">
              {part.slice(1, -1)}
            </code>
          );
        }
        return (
          <span key={i}>
            <DiffColoredText text={part} />
          </span>
        );
      })}
    </>
  );
}

function DiffColoredText({ text }) {
  const parts = String(text || '').split(/(\+\d+|-\d+)/g);
  return parts.map((part, i) => {
    if (/^\+\d+$/.test(part)) {
      return (
        <span key={i} className="font-medium text-emerald-400">
          {part}
        </span>
      );
    }
    if (/^-\d+$/.test(part)) {
      return (
        <span key={i} className="font-medium text-red-400">
          {part}
        </span>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

function diffToneClass(text = '') {
  if (/^\+\d+$/.test(text)) return 'text-emerald-400';
  if (/^-\d+$/.test(text)) return 'text-red-400';
  return '';
}

function shortUrl(url = '') {
  if (String(url).startsWith('blob:')) return 'local preview';
  return String(url).replace(/^https?:\/\//, '').slice(0, 56);
}

function IconAction({ icon: Icon, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
    >
      <Icon size={13} />
      <span>{label}</span>
    </button>
  );
}

function AttachmentChip({ file }) {
  const meta = attachmentKindMeta(file);
  return (
    <span className={`inline-flex max-w-full items-center gap-2 rounded-xl border px-2.5 py-1.5 text-[11px] ${meta.color}`}>
      {file.kind === 'image' && file.dataUrl ? (
        <img src={file.dataUrl} alt="" className="h-8 w-8 rounded object-cover" />
      ) : (
        <FileIcon path={file.name || file.path} className="h-5 w-5" />
      )}
      <span className="min-w-0">
        <span className="block truncate font-medium">{file.name}</span>
        <span className="block text-[10px] opacity-80">
          {file.previewNote || meta.label}
          {file.size ? ` · ${formatSize(file.size)}` : ''}
        </span>
      </span>
    </span>
  );
}

function formatSize(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
