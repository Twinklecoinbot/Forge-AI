import { extractFiles } from './fileParser.js';

/** Strip file payloads / fenced code so chat stays conversational (Cursor-style). */
export function stripCodePayloads(text = '') {
  return String(text || '')
    .replace(/<<<FILE path="[^"]+">>>[\s\S]*?<<<END FILE>>>/g, '')
    .replace(/```[\w./+\-#]*\n[\s\S]*?```/g, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/Thinking Process:[\s\S]*?(?=\n#{1,3}\s|\n[A-Z][a-z]+ Process:|$)/gi, '')
    .replace(/(?:^|\n)\s*(?:\d+\.\s*)?\*\*Analyze the Request:\*\*[\s\S]*?(?=\n#{1,3}\s|$)/gi, '\n')
    .replace(/(?:^|\n)#{1,3}\s*(?:Architecture|Database Schema|Directory Structure|Tech Stack)[\s\S]*?(?=\n#{1,3}\s|<<<FILE|$)/gi, '\n')
    .replace(/^\s{0,3}(?:<<<<<<<|=======|>>>>>>>).*$/gm, '')
    .replace(/(?:^|\n)\s*(?:FILE|ATTACHED FILE)\s+[^\n]+\n[\s\S]*?(?=\n(?:FILE|ATTACHED FILE|---|<<<|\s*$))/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function looksLikeGuideDump(text = '') {
  const s = String(text || '');
  const hasFiles = /<<<FILE path=/.test(s) || /```[\w./-]+\n/.test(s);
  if (hasFiles && (s.match(/<<<FILE path=/g) || []).length >= 2) return false;
  return (
    /Thinking Process/i.test(s) ||
    /Let's write down the exact/i.test(s) ||
    /open (VS Code|Visual Studio|Cursor IDE)/i.test(s) ||
    /Deconstruct the UI/i.test(s) ||
    /Architecture & Tech Stack/i.test(s) ||
    (/Analyze the Request/i.test(s) && !hasFiles)
  );
}

/** Short Cursor-like chat face for an assistant turn. */
export function chatFacingText(raw = '', { files = [], busy = false, previewUrl = '' } = {}) {
  if (busy && !files.length) return 'Working on it…';
  if (busy && files.length) return `Writing ${files.length} file${files.length === 1 ? '' : 's'} into Code…`;

  if (looksLikeGuideDump(raw) && !files.length) {
    return 'Model returned a guide instead of files — retrying with a hard FILE contract…';
  }

  const prose = stripCodePayloads(raw);
  const bullets = extractCursorBullets(prose);
  if (files.length) {
    const lines = [];
    if (bullets.cause) lines.push(`**Cause:** ${bullets.cause}`);
    if (bullets.fixes.length) {
      lines.push('**Fixes:**');
      bullets.fixes.slice(0, 6).forEach((f, i) => lines.push(`${i + 1}. ${f}`));
    } else {
      lines.push(`Built **${files.length}** file${files.length === 1 ? '' : 's'} into the Code tab.`);
    }
    if (previewUrl) lines.push(`Preview: \`${previewUrl}\``);
    return lines.join('\n');
  }

  if (prose && !looksLikeGuideDump(raw)) {
    return prose.split(/\n/).filter(Boolean).slice(0, 12).join('\n');
  }
  return '';
}

function extractCursorBullets(prose = '') {
  const causeMatch = prose.match(/(?:\*\*)?Cause(?:\*\*)?:\s*([^\n]+)/i);
  const fixes = [];
  const fixBlock = prose.match(/(?:\*\*)?Fixes?(?:\*\*)?:([\s\S]*?)(?=\n(?:\*\*)?[A-Z][a-z]|$)/i);
  if (fixBlock) {
    String(fixBlock[1])
      .split(/\n/)
      .map((l) => l.replace(/^\s*\d+\.\s*/, '').replace(/^[-*•]\s*/, '').trim())
      .filter(Boolean)
      .forEach((l) => fixes.push(l));
  }
  if (!fixes.length) {
    prose
      .split(/\n/)
      .map((l) => l.replace(/^[-*•]\s*/, '').trim())
      .filter((l) => l && !looksLikeCode(l) && l.length < 140)
      .slice(0, 5)
      .forEach((l) => fixes.push(l));
  }
  return { cause: causeMatch?.[1]?.trim() || '', fixes };
}

export function buildLiveProgress(raw = '', busy = false) {
  const files = extractFiles(raw);
  const guide = looksLikeGuideDump(raw);
  const stages = [];
  stages.push({
    id: 'think',
    label: busy && !files.length ? 'Analyzing request' : 'Analyzed request',
    status: busy && !files.length ? 'active' : 'done'
  });
  if (files.length) {
    stages.push({
      id: 'build',
      label: `Writing files (${files.length})`,
      status: busy ? 'active' : 'done'
    });
  } else if (busy) {
    stages.push({
      id: 'build',
      label: guide ? 'Guide detected — forcing FILE output…' : 'Building…',
      status: 'active'
    });
  }
  if (!busy && files.length) {
    stages.push({ id: 'done', label: 'Delivery complete', status: 'done' });
  }
  return {
    stages,
    fileCount: files.length,
    filePaths: files.map((f) => f.path),
    prose: chatFacingText(raw, { files, busy })
  };
}

export function buildDeliverySummary({ files = [], prose = '', liveUrl = '' } = {}) {
  const done = [];
  const next = [];
  if (files.length) {
    done.push(`Generated ${files.length} file${files.length === 1 ? '' : 's'} in Code`);
  }
  const facing = chatFacingText(prose, { files, previewUrl: liveUrl });
  facing
    .split(/\n/)
    .map((l) => l.replace(/^\*\*?Cause:\*\*?\s*/i, '').replace(/^\*\*?Fixes?:\*\*?\s*/i, '').replace(/^\d+\.\s*/, '').trim())
    .filter((l) => l && !/^Built \*\*/.test(l) && !/^Preview:/i.test(l))
    .slice(0, 6)
    .forEach((l) => done.push(l));

  if (liveUrl) {
    done.push(`Preview ready: ${liveUrl}`);
    next.push('Open Preview tab to view the running UI');
  }
  if (files.length) next.push('Open Code to review the tree');
  if (!next.length) next.push('Send a follow-up to extend the build');
  return { done: unique(done).slice(0, 10), next: unique(next).slice(0, 4) };
}

export function fileChangeStats(files = [], previousFiles = []) {
  const prev = new Map((previousFiles || []).map((f) => [f.path, f]));
  return (files || []).map((file) => {
    const before = prev.get(file.path);
    const newLines = String(file.content || '').split(/\n/).length;
    const oldLines = before ? String(before.content || '').split(/\n/).length : 0;
    const added = before ? Math.max(0, newLines - oldLines) || newLines : newLines;
    const removed = before ? Math.max(0, oldLines - newLines) : 0;
    return {
      path: file.path,
      added: before && newLines === oldLines ? Math.max(1, Math.round(newLines * 0.15)) : added,
      removed,
      language: (file.path.split('.').pop() || 'txt').toUpperCase().slice(0, 4)
    };
  });
}

function looksLikeCode(line = '') {
  const s = String(line);
  if (s.length > 160) return true;
  if (/^(import|export|const|let|var|function|class|interface|type|package|using|#include)\b/.test(s)) return true;
  if (/[{};<>]/.test(s) && /=/.test(s)) return true;
  if (/<<<FILE|<<<END|```/.test(s)) return true;
  return false;
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
  return {
    label: 'File',
    color: 'bg-[var(--bg-hover)] text-[var(--text-muted)] border-[var(--border)]',
    badge: (ext || 'FILE').slice(0, 4).toUpperCase()
  };
}
