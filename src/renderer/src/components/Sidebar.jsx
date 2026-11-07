import { useEffect, useRef, useState } from 'react';
import {
  Archive, ChevronRight, FilePlus2, FolderPlus, GitBranch, Moon, Pin, Plus, Search, Settings, SquarePen, Sun, Trash2, Workflow
} from 'lucide-react';
import { useForge } from '../store/ForgeContext.jsx';
import { treeFromFiles } from '../services/fileParser.js';
import Logo from './Logo.jsx';

export default function Sidebar() {
  const {
    view, setView, sidebarTab, setSidebarTab, chats, activeChatId, setActiveChatId, newChat, newProject, deleteProject,
    pickProjectFolder, createProjectOnDisk, importBrowserFolder, createFileInProject, createFolderInProject,
    projectMenuOpen, setProjectMenuOpen, projects, activeProjectId, setActiveProjectId, files, setActiveFile, setOpenTabs,
    githubRepos, settings, setSettingsOpen, setSearchOpen, theme, setTheme, pinChat, archiveChat, deleteChat,
    setWorkspaceMode, showToast, isElectron, activeProject
  } = useForge();
  const folderInputRef = useRef(null);
  const menuRef = useRef(null);
  const [creating, setCreating] = useState(null);

  useEffect(() => {
    if (!projectMenuOpen) return undefined;
    const onDoc = (e) => {
      if (!menuRef.current?.contains(e.target)) setProjectMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [projectMenuOpen, setProjectMenuOpen]);

  return (
    <aside className="flex h-full w-[252px] flex-col border-r border-[var(--border)] bg-[var(--bg-sidebar)]">
      <div className="flex items-center gap-1 px-2 py-2">
        <button className="grid h-8 w-8 place-items-center" onClick={() => { setWorkspaceMode('chat'); setView('home'); }}>
          <Logo className="h-7 w-7" theme={theme} />
        </button>
        <button className="grid h-8 w-8 place-items-center rounded-md text-[var(--text-muted)] hover:bg-[var(--bg-hover)]" onClick={() => setSearchOpen(true)}>
          <Search size={16} />
        </button>
        <div className="flex-1" />
        <button className="grid h-8 w-8 place-items-center rounded-md text-[var(--text-muted)] hover:bg-[var(--bg-hover)]" onClick={newChat}>
          <SquarePen size={15} />
        </button>
      </div>

      <div className="px-2 pb-2">
        <Nav icon={SquarePen} label="New Chat" active={(view === 'home' || view === 'agent') && sidebarTab === 'chats'} onClick={newChat} />
        <Nav icon={Workflow} label="Automations" active={view === 'rules'} onClick={() => { setSidebarTab('rules'); setView('rules'); }} />
        <Nav icon={Settings} label="Customize" onClick={() => setSettingsOpen(true)} />
      </div>

      <div className="forge-scroll flex-1 px-2 pb-3">
        <Section
          title="Projects"
          action={
            <div className="relative" ref={menuRef}>
              <button onClick={() => setProjectMenuOpen(!projectMenuOpen)} className="text-[var(--text-muted)] hover:text-[var(--text)]">
                <Plus size={14} />
              </button>
              {projectMenuOpen && (
                <div className="absolute right-0 z-20 mt-1 w-52 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] py-1 shadow-xl">
                  <MenuItem onClick={() => { newProject(); setProjectMenuOpen(false); }}>Empty project</MenuItem>
                  <MenuItem onClick={async () => {
                    setCreating('open');
                    const r = await pickProjectFolder();
                    if (r?.needsBrowserPicker) folderInputRef.current?.click();
                    setCreating(null);
                    setProjectMenuOpen(false);
                  }}>{creating === 'open' ? 'Opening…' : 'Open folder from PC'}</MenuItem>
                  <MenuItem onClick={async () => {
                    const name = window.prompt('Project folder name', 'my-app');
                    if (!name) return;
                    setCreating('folder');
                    await createProjectOnDisk(name);
                    setCreating(null);
                    setProjectMenuOpen(false);
                  }}>{creating === 'folder' ? 'Creating…' : 'Create folder on PC'}</MenuItem>
                  {activeProjectId && (
                    <>
                      <div className="my-1 border-t border-[var(--border)]" />
                      <MenuItem onClick={() => { const p = window.prompt('New file path'); if (p) createFileInProject(p); }}>
                        <FilePlus2 size={12} /> New file
                      </MenuItem>
                      <MenuItem onClick={() => { const p = window.prompt('New folder path'); if (p) createFolderInProject(p); }}>
                        <FolderPlus size={12} /> New folder
                      </MenuItem>
                    </>
                  )}
                </div>
              )}
              <input ref={folderInputRef} type="file" className="hidden" webkitdirectory="" directory="" multiple
                onChange={async (e) => {
                  if (e.target.files?.length) await importBrowserFolder([...e.target.files]);
                  e.target.value = '';
                  setProjectMenuOpen(false);
                }}
              />
            </div>
          }
        >
          {projects.length === 0 && <div className="px-2 py-2 text-[12px] text-[var(--text-muted)]">Generate an app or open a folder.</div>}
          {projects.map((project) => (
            <div key={project.id} className={`group mb-0.5 flex items-center rounded-md text-[12.5px] ${project.id === activeProjectId ? 'forge-active' : 'hover:bg-[var(--bg-hover)]'}`}>
              <button
                className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left"
                onClick={() => {
                  setActiveProjectId(project.id);
                  setSidebarTab('files');
                  setView(project.files.length ? 'workspace' : 'home');
                  setOpenTabs(project.files.slice(0, 4).map((f) => f.path));
                  setActiveFile(project.files[0]?.path || null);
                }}
              >
                <Logo className="h-3.5 w-3.5" theme={theme} />
                <span className="truncate">{project.name}</span>
                <span className="ml-auto text-[10px] text-[var(--text-muted)]">{project.files.length}</span>
              </button>
              <button
                className="mr-1 hidden h-6 w-6 place-items-center text-[var(--text-muted)] hover:text-red-400 group-hover:grid"
                onClick={() => { if (window.confirm(`Delete “${project.name}”?`)) deleteProject(project.id); }}
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
          {activeProject?.rootPath && (
            <div className="mt-1 truncate px-2 text-[10px] text-[var(--text-muted)]" title={activeProject.rootPath}>{activeProject.rootPath}</div>
          )}
          {activeProjectId && files.length > 0 && sidebarTab === 'files' && (
            <div className="mt-2 border-t border-[var(--border)] pt-2">
              <FileNodes nodes={treeFromFiles(files)} onOpen={(path) => {
                setActiveFile(path);
                setOpenTabs((tabs) => (tabs.includes(path) ? tabs : [...tabs, path]));
                setView('workspace');
              }} />
            </div>
          )}
        </Section>

        <Section title="Chats">
          {chats.filter((c) => !c.archived).sort((a, b) => Number(b.pinned) - Number(a.pinned)).map((chat) => (
            <ChatRow key={chat.id} chat={chat} active={chat.id === activeChatId}
              onOpen={() => { setActiveChatId(chat.id); setSidebarTab('chats'); setView(chat.messages.length ? 'agent' : 'home'); }}
              onPin={() => pinChat(chat.id)} onArchive={() => archiveChat(chat.id)} onDelete={() => deleteChat(chat.id)} />
          ))}
        </Section>

        <Section title="Repositories">
          {!settings.githubUser && (
            <button className="w-full rounded-md px-2 py-1.5 text-left text-[12px] text-[var(--text-muted)] hover:bg-[var(--bg-hover)]" onClick={() => setView('github')}>
              Connect GitHub
            </button>
          )}
          {githubRepos.slice(0, 12).map((repo) => (
            <a key={repo.id} href={repo.html_url} target="_blank" rel="noreferrer" className="forge-row mb-0.5 flex items-center gap-2 rounded-md px-2 py-1.5 text-[12.5px]">
              <GitBranch size={12} className="text-[var(--text-muted)]" />
              <span className="truncate">{repo.name}</span>
            </a>
          ))}
        </Section>
      </div>

      <div className="flex items-center gap-2 border-t border-[var(--border)] px-3 py-3">
        <div className="grid h-7 w-7 place-items-center rounded-full bg-[var(--bg-hover)] text-[11px] font-semibold">
          {(settings.githubUser?.login || 'FA').slice(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12px]">{settings.githubUser?.login || 'Local workspace'}</div>
          <div className="truncate text-[11px] text-[var(--text-muted)]">{activeProject?.rootPath || settings.workspaceRoot || (isElectron ? 'This PC' : 'browser-workspace')}</div>
        </div>
        <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="text-[var(--text-muted)]">
          {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
        </button>
        <button onClick={() => setSettingsOpen(true)} className="text-[var(--text-muted)]"><Settings size={14} /></button>
      </div>
    </aside>
  );
}

function Nav({ icon: Icon, label, active, onClick }) {
  return (
    <button onClick={onClick} className={`mb-0.5 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[13px] ${active ? 'forge-active' : 'hover:bg-[var(--bg-hover)]'}`}>
      {active ? <ChevronRight size={14} className="text-[var(--text-muted)]" /> : <Icon size={14} className="text-[var(--text-muted)]" />}
      <span>{label}</span>
    </button>
  );
}
function Section({ title, children, action }) {
  return (
    <div className="mb-4">
      <div className="mb-1 flex items-center justify-between px-2 text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
        <span>{title}</span>{action}
      </div>
      {children}
    </div>
  );
}
function MenuItem({ children, onClick }) {
  return <button onClick={onClick} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] hover:bg-[var(--bg-hover)]">{children}</button>;
}
function ChatRow({ chat, active, onOpen, onPin, onArchive, onDelete }) {
  return (
    <div className={`group mb-0.5 flex items-center rounded-md px-2 py-1.5 text-[12.5px] ${active ? 'forge-active' : 'hover:bg-[var(--bg-hover)]'}`}>
      <button onClick={onOpen} className="min-w-0 flex-1 truncate text-left">{chat.pinned ? '📌 ' : ''}{chat.title}</button>
      <div className="hidden items-center gap-1 text-[var(--text-muted)] group-hover:flex">
        <button onClick={onPin}><Pin size={11} /></button>
        <button onClick={onArchive}><Archive size={11} /></button>
        <button onClick={onDelete}><Trash2 size={11} /></button>
      </div>
    </div>
  );
}
function FileNodes({ nodes, onOpen, depth = 0 }) {
  return nodes.map((node) => (
    <div key={node.path} style={{ paddingLeft: depth * 10 }}>
      {node.type === 'dir' ? (
        <div>
          <div className="px-2 py-1 text-[12px] text-[var(--text-muted)]">{node.name}</div>
          <FileNodes nodes={node.children || []} onOpen={onOpen} depth={depth + 1} />
        </div>
      ) : (
        <button onClick={() => onOpen(node.path)} className="forge-row block w-full truncate rounded-md px-2 py-1 text-left text-[12.5px]">{node.name}</button>
      )}
    </div>
  ));
}
