import { useState } from 'react';
import { Github, Link2 } from 'lucide-react';
import { useForge } from '../store/ForgeContext.jsx';

export default function GitHubPanel() {
  const { settings, files, connectGithub, publishToGithub, githubRepos, showToast, saveSettings, activeProject } =
    useForge();
  const [token, setToken] = useState('');
  const [repoName, setRepoName] = useState(slug(activeProject?.name || 'forge-app'));
  const [isPrivate, setIsPrivate] = useState(false);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  return (
    <div className="mx-auto w-full max-w-3xl overflow-auto px-8 py-8">
      <h1 className="text-2xl font-semibold">GitHub & deploy</h1>
      <p className="mt-1 text-[13.5px] text-[var(--text-muted)]">
        Connect GitHub, publish the workspace, and host a live preview.
      </p>
      <section className="mt-8 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5">
        <h2 className="text-[14px] font-medium">Connection</h2>
        {settings.githubUser ? (
          <div className="mt-3">
            <div className="mb-3 flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[12.5px] text-emerald-300">
              <Link2 size={14} />
              Connected as @{settings.githubUser.login}
            </div>
            <button
              className="text-[12.5px] text-[var(--text-muted)] underline"
              onClick={() => saveSettings({ githubToken: '', githubUser: null })}
            >
              Disconnect
            </button>
          </div>
        ) : (
          <div className="mt-3 flex gap-2">
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="GitHub personal access token"
              className="flex-1 rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[13px] outline-none"
            />
            <button
              className="inline-flex items-center gap-2 rounded-md bg-[#238636] px-3 py-2 text-[12.5px] font-medium text-white hover:bg-[#2ea043] disabled:opacity-40"
              disabled={busy || !token.trim()}
              onClick={async () => {
                try {
                  setBusy(true);
                  await connectGithub(token.trim());
                  setToken('');
                } catch (e) {
                  showToast(e.message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Github size={15} />
              Connect
            </button>
          </div>
        )}
      </section>
      <section className="mt-5 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5">
        <h2 className="text-[14px] font-medium">Publish current workspace</h2>
        <p className="mt-1 text-[12.5px] text-[var(--text-muted)]">
          {files.length} files ready{activeProject ? ` from ${activeProject.name}` : ''}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            value={repoName}
            onChange={(e) => setRepoName(e.target.value)}
            className="rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[13px] outline-none"
          />
          <label className="flex items-center gap-2 text-[12.5px] text-[var(--text-muted)]">
            <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} /> Private
          </label>
          <button
            disabled={busy || !settings.githubUser}
            className="rounded-md bg-[#238636] px-4 py-2 text-[13px] font-medium text-white hover:bg-[#2ea043] disabled:opacity-40"
            onClick={async () => {
              try {
                setBusy(true);
                setResult(await publishToGithub({ name: repoName, isPrivate }));
              } catch (e) {
                showToast(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Create repo & push
          </button>
        </div>
        {result && (
          <div className="mt-4 rounded-md border border-[var(--border)] bg-[var(--bg)] p-3 text-[13px]">
            <div>
              Repo:{' '}
              <a className="underline" href={result.repo.html_url} target="_blank" rel="noreferrer">
                {result.repo.html_url}
              </a>
            </div>
            <div className="mt-1">
              Live:{' '}
              <a className="underline" href={result.live} target="_blank" rel="noreferrer">
                {result.live}
              </a>
            </div>
            <p className="mt-2 text-[12px] text-[var(--text-muted)]">Pages can take 1–2 minutes. Prefer a public repo.</p>
          </div>
        )}
      </section>
      {githubRepos.length > 0 && (
        <section className="mt-5">
          <h2 className="mb-2 text-[13px] uppercase tracking-wider text-[var(--text-muted)]">Recent repos</h2>
          <div className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)]">
            {githubRepos.slice(0, 8).map((repo) => (
              <a
                key={repo.id}
                href={repo.html_url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between px-4 py-2 text-[13px] hover:bg-[var(--bg-hover)]"
              >
                <span>{repo.full_name}</span>
                <span className="text-[var(--text-muted)]">{repo.private ? 'private' : 'public'}</span>
              </a>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
function slug(name) {
  return (
    String(name || 'forge-app')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80) || 'forge-app'
  );
}
