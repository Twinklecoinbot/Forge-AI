/** VS Code–style file / folder icons by extension */
export default function FileIcon({ path = '', type = 'file', className = 'h-4 w-4' }) {
  if (type === 'dir') {
    return (
      <span className={`inline-grid place-items-center ${className}`} title="Folder">
        <svg viewBox="0 0 16 16" className="h-full w-full">
          <path
            fill="#dcb67a"
            d="M1.5 2.5A1.5 1.5 0 0 1 3 1h3.586a1.5 1.5 0 0 1 1.06.44L9.122 2.94A.5.5 0 0 0 9.475 3H13a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 13 14H3a1.5 1.5 0 0 1-1.5-1.5v-10z"
          />
        </svg>
      </span>
    );
  }
  const name = String(path).split('/').pop() || '';
  const ext = (name.includes('.') ? name.split('.').pop() : '').toLowerCase();
  const meta = EXT[ext] || EXT._default;
  return (
    <span
      className={`inline-grid place-items-center rounded-[3px] text-[8px] font-bold leading-none ${className}`}
      style={{ background: meta.bg, color: meta.fg, minWidth: '1rem', minHeight: '1rem' }}
      title={ext || 'file'}
    >
      {meta.label}
    </span>
  );
}

const EXT = {
  js: { label: 'JS', bg: '#f7df1e', fg: '#000' },
  mjs: { label: 'JS', bg: '#f7df1e', fg: '#000' },
  cjs: { label: 'JS', bg: '#f7df1e', fg: '#000' },
  jsx: { label: '⚛', bg: '#61dafb', fg: '#000' },
  ts: { label: 'TS', bg: '#3178c6', fg: '#fff' },
  tsx: { label: '⚛', bg: '#3178c6', fg: '#fff' },
  json: { label: '{}', bg: '#cbcb41', fg: '#000' },
  css: { label: '#', bg: '#264de4', fg: '#fff' },
  scss: { label: 'S', bg: '#cd6799', fg: '#fff' },
  html: { label: '<>', bg: '#e34f26', fg: '#fff' },
  htm: { label: '<>', bg: '#e34f26', fg: '#fff' },
  md: { label: 'M↓', bg: '#083fa1', fg: '#fff' },
  mdx: { label: 'M↓', bg: '#f9ac00', fg: '#000' },
  py: { label: 'PY', bg: '#3776ab', fg: '#ffd343' },
  go: { label: 'GO', bg: '#00add8', fg: '#fff' },
  rs: { label: 'RS', bg: '#dea584', fg: '#000' },
  java: { label: 'J', bg: '#ea2d2e', fg: '#fff' },
  php: { label: 'P', bg: '#777bb4', fg: '#fff' },
  rb: { label: 'RB', bg: '#cc342d', fg: '#fff' },
  vue: { label: 'V', bg: '#41b883', fg: '#fff' },
  svelte: { label: 'S', bg: '#ff3e00', fg: '#fff' },
  svg: { label: 'SVG', bg: '#ffb13b', fg: '#000' },
  png: { label: 'IMG', bg: '#3fa848', fg: '#fff' },
  jpg: { label: 'IMG', bg: '#3fa848', fg: '#fff' },
  jpeg: { label: 'IMG', bg: '#3fa848', fg: '#fff' },
  webp: { label: 'IMG', bg: '#3fa848', fg: '#fff' },
  gif: { label: 'IMG', bg: '#3fa848', fg: '#fff' },
  yml: { label: 'Y', bg: '#cb171e', fg: '#fff' },
  yaml: { label: 'Y', bg: '#cb171e', fg: '#fff' },
  toml: { label: 'T', bg: '#9c4121', fg: '#fff' },
  env: { label: 'ENV', bg: '#ecd53f', fg: '#000' },
  prisma: { label: 'P', bg: '#2d3748', fg: '#5a67d8' },
  sql: { label: 'SQL', bg: '#e38c00', fg: '#fff' },
  sh: { label: '>_', bg: '#4eaa25', fg: '#fff' },
  bash: { label: '>_', bg: '#4eaa25', fg: '#fff' },
  gitignore: { label: 'GI', bg: '#f05033', fg: '#fff' },
  txt: { label: 'TXT', bg: '#6b7280', fg: '#fff' },
  _default: { label: '•', bg: '#4b5563', fg: '#e5e7eb' }
};
