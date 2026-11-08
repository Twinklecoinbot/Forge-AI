import { useState } from 'react';
import { Github, Link2, Pencil } from 'lucide-react';
import { useForge } from '../store/ForgeContext.jsx';
import { renameRepo } from '../services/githubService.js';

export default function GitHubPanel() {
  const {
    settings,
    files,
    connectGithub,
    publishToGithub,
    githubRepos,
    setGithubRepos,
    showToast,
    saveSettings,
    activeProject,
    renameProject
  } = useForge();
  const [token, setToken] = useState('');
  const [repoName, setRepoName] = useState(slug(activeProject?.name || 'forge-app'));
  const [isPrivate, setIsPrivate] = useState(false);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');

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
            {githubRepos.slice(0, 12).map((repo) => (
              <div key={repo.id} className="flex items-center gap-2 px-4 py-2 text-[13px] hover:bg-[var(--bg-hover)]">
                {renamingId === repo.id ? (
                  <>
                    <input
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      className="flex-1 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-[13px] outline-none"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') setRenamingId(null);
                      }}
                    />
                    <button
                      type="button"
                      disabled={busy}
                      className="rounded-md bg-[#238636] px-2 py-1 text-[12px] text-white disabled:opacity-40"
                      onClick={async () => {
                        try {
                          setBusy(true);
                          const owner = repo.owner?.login || settings.githubUser?.login;
                          const updated = await renameRepo(settings.githubToken, {
                            owner,
                            repo: repo.name,
                            name: renameValue
                          });
                          setGithubRepos((list) =>
                            list.map((r) => (r.id === repo.id ? { ...r, ...updated, name: updated.name, full_name: updated.full_name, html_url: updated.html_url } : r))
                          );
                          if (activeProject?.githubRepo?.name === repo.name) {
                            renameProject?.(activeProject.id, updated.name);
                          }
                          setRenamingId(null);
                          showToast(`Renamed to ${updated.name}`);
                        } catch (e) {
                          showToast(e.message);
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Save
                    </button>
                    <button type="button" className="text-[12px] text-[var(--text-muted)]" onClick={() => setRenamingId(null)}>
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <a href={repo.html_url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate underline-offset-2 hover:underline">
                      {repo.full_name}
                    </a>
                    <span className="text-[var(--text-muted)]">{repo.private ? 'private' : 'public'}</span>
                    <button
                      type="button"
                      title="Rename repository"
                      className="grid h-7 w-7 place-items-center rounded-md text-[var(--text-muted)] hover:bg-[var(--bg)] hover:text-[var(--text)]"
                      onClick={() => {
                        setRenamingId(repo.id);
                        setRenameValue(repo.name);
                      }}
                    >
                      <Pencil size={13} />
                    </button>
                  </>
                )}
              </div>
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
