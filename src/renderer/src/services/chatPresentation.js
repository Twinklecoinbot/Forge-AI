import { extractFiles } from './fileParser.js';

/** Strip file payloads so chat stays conversational. */
export function stripCodePayloads(text = '') {
  return String(text || '')
    .replace(/<<<FILE path="[^"]+">>>[\s\S]*?<<<END FILE>>>/g, '')
    .replace(/```[\w./-]*\n[\s\S]*?```/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function buildLiveProgress(raw = '', busy = false) {
  const files = extractFiles(raw);
  const prose = stripCodePayloads(raw);
  const stages = [];
  if (busy && !prose && !files.length) {
    stages.push({ id: 'think', label: 'Analyzing request', status: 'active' });
  } else {
    stages.push({ id: 'think', label: 'Analyzed request', status: 'done' });
  }
  if (files.length) {
    stages.push({
      id: 'build',
      label: `Writing files (${files.length})`,
      status: busy ? 'active' : 'done'
    });
  } else if (busy) {
    stages.push({ id: 'build', label: 'Planning / generating', status: 'active' });
  }
  if (!busy && (files.length || prose)) {
    stages.push({ id: 'done', label: 'Delivery complete', status: 'done' });
  }
  return {
    stages,
    fileCount: files.length,
    filePaths: files.map((f) => f.path),
    prose: prose || (busy ? '' : 'Done.')
  };
}

export function buildDeliverySummary({ files = [], prose = '', liveUrl = '' } = {}) {
  const done = [];
  const next = [];
  if (files.length) {
    done.push(`Generated ${files.length} file${files.length === 1 ? '' : 's'} in Code`);
    done.push(...files.slice(0, 8).map((f) => `• ${f.path}`));
    if (files.length > 8) done.push(`• …and ${files.length - 8} more`);
  }
  const clean = stripCodePayloads(prose);
  if (clean) {
    const lines = clean.split(/\n/).map((l) => l.trim()).filter(Boolean).slice(0, 6);
    lines.forEach((l) => {
      if (/^[-*•]/.test(l) || /next/i.test(l)) next.push(l.replace(/^[-*•]\s*/, ''));
      else if (done.length < 12) done.push(l);
    });
  }
  if (liveUrl) {
    done.push(`Live preview: ${liveUrl}`);
    next.push('Open Preview to test the running UI');
  }
  if (!next.length) {
    next.push('Open Code to review files');
    next.push('Use Preview for UI check');
    next.push('Push from GitHub panel for a public live link');
  }
  return { done: unique(done).slice(0, 14), next: unique(next).slice(0, 6) };
}

function unique(list) {
  return [...new Set(list.filter(Boolean))];
}

export function attachmentKindMeta(file) {
  const name = file.name || file.path || 'file';
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (file.kind === 'image' || /^(png|jpe?g|gif|webp|svg)$/.test(ext)) {
    return { label: 'Image', color: 'bg-sky-500/20 text-sky-300 border-sky-500/30', badge: 'IMG' };
  }
  if (ext === 'zip' || file.kind === 'zip' || file.mime === 'application/zip') {
    return { label: 'ZIP archive', color: 'bg-amber-500/20 text-amber-300 border-amber-500/30', badge: 'ZIP' };
  }
  if (/^(js|jsx|ts|tsx|mjs|cjs)$/.test(ext)) {
    return { label: 'JavaScript', color: 'bg-yellow-500/20 text-yellow-200 border-yellow-500/30', badge: ext.toUpperCase() };
  }
  if (/^(css|scss)$/.test(ext)) {
    return { label: 'Styles', color: 'bg-pink-500/20 text-pink-300 border-pink-500/30', badge: 'CSS' };
  }
  if (/^(html?|vue|svelte)$/.test(ext)) {
    return { label: 'Markup', color: 'bg-orange-500/20 text-orange-300 border-orange-500/30', badge: 'HTML' };
  }
  if (/^(json|ya?ml|toml)$/.test(ext)) {
    return { label: 'Config', color: 'bg-violet-500/20 text-violet-300 border-violet-500/30', badge: 'CFG' };
  }
  if (/^(md|txt)$/.test(ext)) {
    return { label: 'Document', color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30', badge: 'DOC' };
  }
  if (/^(py|go|rs|java|php|rb)$/.test(ext)) {
    return { label: 'Source', color: 'bg-lime-500/20 text-lime-300 border-lime-500/30', badge: ext.toUpperCase() };
  }
  return { label: 'File', color: 'bg-[var(--bg-hover)] text-[var(--text-muted)] border-[var(--border)]', badge: (ext || 'FILE').slice(0, 4).toUpperCase() };
}
