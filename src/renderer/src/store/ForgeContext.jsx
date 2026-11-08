import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { bridge } from '../services/bridge.js';
import { CODING_FREE_MODEL, DEFAULT_MODELS, explainModelError, resolveWorkingModel } from '../services/openRouterEngine.js';
import { STARTER_RULES, createBlankRule, compileSystemPrompt, ensureExecutionRules } from '../services/rulesEngine.js';
import { createAgentStages, runForgeAgent } from '../services/forgeAgent.js';
import {
  isLikelyTextPath,
  languageFromPath,
  previewHtml,
  projectNameFromPrompt,
  readBrowserFile
} from '../services/fileParser.js';
import {
  ensureRepo,
  enablePages,
  getGithubUser,
  listRepos,
  pagesUrl,
  probeLiveUrl,
  pushFiles,
  setRepoHomepage,
  waitForPages
} from '../services/githubService.js';
import {
  loadPersistedRules,
  persistRules,
  persistRulesDurable,
  refineSystemRules,
  rulesFromSettings
} from '../services/ruleRefiner.js';
import { buildDeliverySummary, chatFacingText } from '../services/chatPresentation.js';
import { unpackZipFile } from '../services/archiveService.js';

const ForgeContext = createContext(null);
const uid = () => Math.random().toString(36).slice(2, 10);

const defaultChat = (extras = {}) => ({
  id: uid(),
  title: extras.title || 'New Chat',
  projectId: extras.projectId || null,
  messages: [],
  createdAt: Date.now(),
  pinned: false,
  archived: false,
  ...extras
});

const defaultProject = (name = 'Untitled project', extras = {}) => ({
  id: uid(),
  name,
  files: [],
  rootPath: null,
  githubRepo: null,
  liveUrl: null,
  previewUrl: null,
  chatId: null,
  arrangedAt: Date.now(),
  createdAt: Date.now(),
  ...extras
});

function relativeTime(ts) {
  const diff = Date.now() - (ts || Date.now());
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 60) return `${d}d`;
  return `${Math.floor(d / 30)}mo`;
}

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

/** Persist chats without huge file bodies (avoids quota wipe). */
function slimChatsForStorage(chats = []) {
  const ranked = [...chats].sort((a, b) => {
    const am = a.messages?.length ? 1 : 0;
    const bm = b.messages?.length ? 1 : 0;
    if (am !== bm) return bm - am;
    if (Boolean(a.pinned) !== Boolean(b.pinned)) return Number(b.pinned) - Number(a.pinned);
    return (b.createdAt || 0) - (a.createdAt || 0);
  });
  return ranked.slice(0, 60).map((chat) => ({
    ...chat,
    messages: (chat.messages || []).slice(-80).map((m) => ({
      ...m,
      // Keep paths/stats for Files Changed UI; drop bulky source bodies
      files: (m.files || []).map((f) => ({
        path: f.path,
        language: f.language,
        content: typeof f.content === 'string' && f.content.length > 4000 ? '' : f.content
      })),
      content: typeof m.content === 'string' && m.content.length > 12000 ? m.content.slice(0, 12000) : m.content
    }))
  }));
}

export function ForgeProvider({ children }) {
  const [theme, setTheme] = useState(() => localStorage.getItem('forge.theme') || 'dark');
  const [view, setView] = useState('home');
  const [sidebarTab, setSidebarTab] = useState('chats');
  const [chats, setChats] = useState(() => {
    const stored = readJson('forge.chats', []);
    return Array.isArray(stored) ? stored : [];
  });
  const [activeChatId, setActiveChatId] = useState(() => localStorage.getItem('forge.activeChatId') || null);
  const [projects, setProjects] = useState(() => {
    const stored = readJson('forge.projects', []);
    return Array.isArray(stored) ? stored : [];
  });
  const [activeProjectId, setActiveProjectId] = useState(() => localStorage.getItem('forge.activeProjectId') || null);
  const [openTabs, setOpenTabs] = useState([]);
  const [activeFile, setActiveFile] = useState(null);
  const [attachedPaths, setAttachedPaths] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [rules, setRules] = useState(() => loadPersistedRules(STARTER_RULES));
  const [prompts, setPrompts] = useState([]);
  const [activePromptId, setActivePromptId] = useState(null);
  const [settings, setSettings] = useState({
    openRouterKey: '',
    openRouterKey2: '',
    githubToken: '',
    model: CODING_FREE_MODEL,
    provider: 'openrouter',
    localBaseUrl: 'http://127.0.0.1:11434',
    workspaceRoot: '',
    githubUser: null
  });
  const [localModels, setLocalModels] = useState([]);
  const [workspaceMode, setWorkspaceMode] = useState('chat');
  const [browserUrl, setBrowserUrl] = useState('');
  const [composer, setComposer] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('Ready');
  const [terminal, setTerminal] = useState([]);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [githubRepos, setGithubRepos] = useState([]);
  const [toast, setToast] = useState('');
  const [learningBusy, setLearningBusy] = useState(false);
  const abortRef = useRef(null);
  const lastPromptRef = useRef('');
  const projectsRef = useRef(projects);
  const activeProjectIdRef = useRef(activeProjectId);
  const hydratedRef = useRef(false);
  const chatsRef = useRef(chats);
  const activeChatIdRef = useRef(activeChatId);
  const lastWriteProjectIdRef = useRef(null);

  const activeProject = projects.find((p) => p.id === activeProjectId) || null;
  const files = activeProject?.files || [];
  const activeChat = chats.find((c) => c.id === activeChatId) || null;
  const projectRoot = activeProject?.rootPath || settings.workspaceRoot || null;

  useEffect(() => {
    projectsRef.current = projects;
  }, [projects]);
  useEffect(() => {
    chatsRef.current = chats;
  }, [chats]);
  useEffect(() => {
    activeProjectIdRef.current = activeProjectId;
  }, [activeProjectId]);
  useEffect(() => {
    activeChatIdRef.current = activeChatId;
  }, [activeChatId]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('forge.theme', theme);
  }, [theme]);

  useEffect(() => {
    if (activeChatId) localStorage.setItem('forge.activeChatId', activeChatId);
  }, [activeChatId]);

  useEffect(() => {
    // Keep local + durable copies; never wipe on logout/disconnect
    persistRules(rules);
  }, [rules]);

  useEffect(() => {
    (async () => {
      const loaded = await bridge.loadSettings();
      const local = JSON.parse(localStorage.getItem('forge.secrets') || '{}');
      let seeded = {};
      try {
        const res = await fetch('/__forge_secrets');
        if (res.ok) seeded = await res.json();
      } catch {
        /* optional */
      }
      const restoredRules = ensureExecutionRules(rulesFromSettings(loaded, STARTER_RULES));
      setRules(restoredRules);
      persistRules(restoredRules);
      setSettings((s) => ({
        ...s,
        ...loaded,
        openRouterKey: local.openRouterKey || seeded.openRouterKey || '',
        openRouterKey2: local.openRouterKey2 || seeded.openRouterKey2 || '',
        githubToken: local.githubToken || '',
        model: resolveWorkingModel(local.model || loaded.model || CODING_FREE_MODEL, {
          provider: local.provider || loaded.provider || 'openrouter'
        }),
        provider: local.provider || loaded.provider || 'openrouter',
        localBaseUrl: local.localBaseUrl || loaded.localBaseUrl || 'http://127.0.0.1:11434',
        workspaceRoot: loaded.workspaceRoot || s.workspaceRoot
      }));
      const savedProjectId = localStorage.getItem('forge.activeProjectId');
      let restoredProjects = Array.isArray(projectsRef.current) ? [...projectsRef.current] : [];
      if (!restoredProjects.length) {
        try {
          const persistedProjects = localStorage.getItem('forge.projects');
          if (persistedProjects) restoredProjects = JSON.parse(persistedProjects) || [];
        } catch {
          restoredProjects = [];
        }
      }
      // Survive secret logout: fall back to durable Electron/userData meta + reload disk files
      if (!restoredProjects.length && Array.isArray(loaded.projectsMeta) && loaded.projectsMeta.length) {
        restoredProjects = loaded.projectsMeta.map((meta) =>
          defaultProject(meta.name || 'Project', {
            id: meta.id || uid(),
            rootPath: meta.rootPath || null,
            liveUrl: meta.liveUrl || null,
            previewUrl: null,
            chatId: meta.chatId || null,
            githubRepo: meta.githubRepo || null,
            arrangedAt: meta.arrangedAt || meta.createdAt || Date.now(),
            createdAt: meta.createdAt || Date.now(),
            files: []
          })
        );
      }
      // Reload file trees from disk for projects with a rootPath (real builds stay inspectable)
      if (bridge.isElectron) {
        restoredProjects = await Promise.all(
          restoredProjects.map(async (project) => {
            if (!project.rootPath || String(project.rootPath).startsWith('browser://')) return project;
            try {
              const loadedFolder = await bridge.readFolderFiles(project.rootPath);
              if (loadedFolder?.files?.length) {
                return {
                  ...project,
                  name: project.name || loadedFolder.name,
                  files: loadedFolder.files,
                  rootPath: loadedFolder.path || project.rootPath
                };
              }
            } catch {
              /* folder may have moved */
            }
            return project;
          })
        );
      }
      if (restoredProjects.length) {
        setProjects(restoredProjects);
        localStorage.setItem('forge.projects', JSON.stringify(restoredProjects));
        const keepProj =
          (savedProjectId && restoredProjects.find((p) => p.id === savedProjectId)?.id) ||
          restoredProjects[0]?.id ||
          null;
        if (keepProj) setActiveProjectId(keepProj);
        const proj = restoredProjects.find((p) => p.id === keepProj);
        if (proj?.liveUrl) setBrowserUrl(proj.liveUrl);
        else if (proj?.files?.length) {
          const html = previewHtml(proj.files);
          if (html) {
            try {
              if (window.__forgePreviewUrl) URL.revokeObjectURL(window.__forgePreviewUrl);
            } catch {
              /* ignore */
            }
            const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
            window.__forgePreviewUrl = url;
            setBrowserUrl(url);
          }
        }
      }
      const savedChatId = localStorage.getItem('forge.activeChatId');
      let parsedChats = Array.isArray(chatsRef.current) ? [...chatsRef.current] : [];
      if (!parsedChats.length) {
        try {
          const persistedChats = localStorage.getItem('forge.chats');
          if (persistedChats) parsedChats = JSON.parse(persistedChats) || [];
        } catch {
          parsedChats = [];
        }
      }
      // Durable Electron backup if localStorage was wiped
      if (!parsedChats.length && Array.isArray(loaded.chatsMeta) && loaded.chatsMeta.length) {
        parsedChats = loaded.chatsMeta;
      }
      if (parsedChats.length) {
        setChats(parsedChats);
        const projectId =
          localStorage.getItem('forge.activeProjectId') || restoredProjects[0]?.id || null;
        const projectChats = projectId
          ? parsedChats.filter((c) => c.projectId === projectId && !c.archived)
          : [];
        // Prefer the project chat that still has history (never jump to an empty twin)
        const projectChatWithHistory = projectChats.find((c) => c.messages?.length) || projectChats[0];
        const keep =
          projectChatWithHistory?.id ||
          (savedChatId && parsedChats.find((c) => c.id === savedChatId && c.messages?.length)?.id) ||
          (savedChatId && parsedChats.find((c) => c.id === savedChatId)?.id) ||
          parsedChats.find((c) => c.messages?.length)?.id ||
          parsedChats[0].id;
        setActiveChatId(keep);
        const keepChat = parsedChats.find((c) => c.id === keep);
        setView(keepChat?.messages?.length ? 'agent' : 'home');
      } else if (restoredProjects.length) {
        // Only seed empty chats when nothing durable exists
        const rebuilt = restoredProjects.map((p) =>
          defaultChat({
            id: p.chatId || uid(),
            title: p.name,
            projectId: p.id
          })
        );
        setChats(rebuilt);
        const first = rebuilt[0];
        if (first) {
          setActiveChatId(first.id);
          setProjects((ps) =>
            ps.map((p) => {
              const chat = rebuilt.find((c) => c.projectId === p.id);
              return chat ? { ...p, chatId: chat.id } : p;
            })
          );
        }
      }
      const persistedPrompts = localStorage.getItem('forge.prompts');
      if (persistedPrompts) setPrompts(JSON.parse(persistedPrompts));
      hydratedRef.current = true;
    })();
    return bridge.onTerminalStream((chunk) => setTerminal((t) => [...t, { id: uid(), ...chunk }]));
  }, []);

  useEffect(() => {
    localStorage.setItem('forge.prompts', JSON.stringify(prompts));
  }, [prompts]);
  useEffect(() => {
    if (!hydratedRef.current && !projects.length) return;
    try {
      localStorage.setItem('forge.projects', JSON.stringify(projects));
      // Durable copy survives secret logout / browser clears of secrets only
      bridge.saveSettings({
        projectsMeta: projects.map((p) => ({
          id: p.id,
          name: p.name,
          rootPath: p.rootPath,
          liveUrl: p.liveUrl,
          previewUrl: p.previewUrl,
          chatId: p.chatId,
          githubRepo: p.githubRepo,
          arrangedAt: p.arrangedAt,
          createdAt: p.createdAt,
          fileCount: p.files?.length || 0
        })),
        projectsUpdatedAt: Date.now()
      }).catch(() => {});
    } catch {
      /* quota */
    }
  }, [projects]);
  useEffect(() => {
    // Never overwrite saved chats with the empty pre-hydrate state
    if (!hydratedRef.current && chats.length === 0) return;
    try {
      const slim = slimChatsForStorage(chats);
      localStorage.setItem('forge.chats', JSON.stringify(slim));
      bridge
        .saveSettings({
          chatsMeta: slim,
          chatsUpdatedAt: Date.now()
        })
        .catch(() => {});
    } catch {
      /* quota — keep previous durable copy */
    }
  }, [chats]);
  useEffect(() => {
    if (activeProjectId) localStorage.setItem('forge.activeProjectId', activeProjectId);
  }, [activeProjectId]);

  // Refresh local preview whenever the active project's files change
  useEffect(() => {
    const project = projects.find((p) => p.id === activeProjectId);
    if (!project?.files?.length) return;
    const html = previewHtml(project.files);
    if (!html) return;
    try {
      if (window.__forgePreviewUrl) URL.revokeObjectURL(window.__forgePreviewUrl);
    } catch {
      /* ignore */
    }
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    window.__forgePreviewUrl = url;
    setBrowserUrl((prev) => {
      if (prev && String(prev).includes('github.io')) return prev;
      return url;
    });
    setProjects((all) =>
      all.map((p) => (p.id === project.id && p.previewUrl !== url ? { ...p, previewUrl: url } : p))
    );
  }, [activeProjectId, activeProject?.files?.length, activeProject?.arrangedAt]);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        // Confirm before creating a fresh chat (same as sidebar New Chat)
        const current = chatsRef.current.find((c) => c.id === (localStorage.getItem('forge.activeChatId') || ''));
        if (current?.messages?.length || chatsRef.current.some((c) => c.messages?.length)) {
          if (!window.confirm('Open a new chat? Your current chat stays saved in the sidebar.')) return;
        }
        const chat = defaultChat();
        setChats((c) => [chat, ...c]);
        setActiveChatId(chat.id);
        setView('home');
        setSidebarTab('chats');
        setComposer('');
        setAttachedPaths([]);
        setAttachments([]);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault();
        setSettingsOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3200);
  };

  const currentRoot = () => {
    const id = activeProjectIdRef.current;
    const project = projectsRef.current.find((p) => p.id === id);
    return project?.rootPath || null;
  };

  const persistSecrets = (next) => {
    localStorage.setItem(
      'forge.secrets',
      JSON.stringify({
        openRouterKey: next.openRouterKey,
        openRouterKey2: next.openRouterKey2,
        githubToken: next.githubToken,
        model: next.model,
        provider: next.provider || 'openrouter',
        localBaseUrl: next.localBaseUrl || 'http://127.0.0.1:11434'
      })
    );
  };

  const setProjectFiles = (updater) => {
    setProjects((prev) => {
      if (!prev.length) {
        const created = defaultProject();
        const nextFiles = typeof updater === 'function' ? updater([]) : updater;
        return [{ ...created, files: nextFiles }];
      }
      return prev.map((project) => {
        if (activeProjectId && project.id !== activeProjectId) return project;
        if (!activeProjectId && project.id !== prev[0].id) return project;
        const nextFiles = typeof updater === 'function' ? updater(project.files) : updater;
        return { ...project, files: nextFiles };
      });
    });
  };

  const upsertFiles = (incoming, projectName, opts = {}) => {
    let targetId = activeProjectIdRef.current;
    const currentChat = chatsRef.current.find((c) => c.id === activeChatIdRef.current);
    const keepStandaloneChat = Boolean(currentChat && !currentChat.projectId);
    setProjects((prev) => {
      let list = prev;
      if (!list.length || !targetId) {
        const created = defaultProject(projectName || 'Untitled project');
        const chat = defaultChat({ title: created.name, projectId: created.id });
        created.chatId = chat.id;
        targetId = created.id;
        list = [created, ...list];
        activeProjectIdRef.current = created.id;
        setActiveProjectId(created.id);
        setChats((c) => {
          if (c.some((x) => x.projectId === created.id && !x.archived)) return c;
          return [chat, ...c];
        });
        if (!keepStandaloneChat) setActiveChatId(chat.id);
      }
      lastWriteProjectIdRef.current = targetId;
      return list.map((project) => {
        if (project.id !== targetId) return project;
        const map = new Map(project.files.map((f) => [f.path, f]));
        incoming.forEach((file) => map.set(file.path, { ...file, language: languageFromPath(file.path) }));
        return {
          ...project,
          name: project.files.length ? project.name : projectName || project.name,
          files: [...map.values()].sort((a, b) => a.path.localeCompare(b.path))
        };
      });
    });
    if (incoming[0] && !opts.skipOpen) {
      setActiveFile(incoming[0].path);
      setOpenTabs((tabs) => {
        const next = [...tabs];
        incoming.forEach((f) => {
          if (!next.includes(f.path)) next.push(f.path);
        });
        return next;
      });
    }
  };

  const newChat = () => {
    // Standalone chat in the Chats section — never replaces the project chat
    const chat = defaultChat({ title: 'New Chat', projectId: null });
    setChats((c) => [chat, ...c]);
    setActiveChatId(chat.id);
    setActiveProjectId(null);
    setView('home');
    setSidebarTab('chats');
    setWorkspaceMode('chat');
    setComposer('');
    setAttachedPaths([]);
    setAttachments([]);
  };

  const requestNewChat = () => {
    newChat();
  };

  /** Open the Chats list on the current chat. New Chat is the pencil button only. */
  const openChatsHome = () => {
    setSidebarTab('chats');
    setWorkspaceMode('chat');
    if (activeChat?.messages?.length) setView('agent');
    else if (activeChat) setView('home');
    else {
      const standalone = chats.find((c) => !c.archived && !c.projectId);
      if (standalone) {
        setActiveChatId(standalone.id);
        setView(standalone.messages?.length ? 'agent' : 'home');
      }
    }
  };

  const renameProject = (projectId, name) => {
    const next = String(name || '').trim();
    if (!next) return;
    setProjects((all) => all.map((p) => (p.id === projectId ? { ...p, name: next } : p)));
    setChats((all) =>
      all.map((c) => (c.projectId === projectId && (!c.messages?.length || c.title === activeProject?.name) ? { ...c, title: next } : c))
    );
    showToast(`Renamed to “${next}”`);
  };

  const editUserMessage = (message) => {
    if (!message || message.role !== 'user') return;
    setComposer(message.content || '');
    setAttachments(message.attachments || []);
    const chatId = activeChatId;
    setChats((all) =>
      all.map((c) => {
        if (c.id !== chatId) return c;
        const idx = c.messages.findIndex((m) => m.id === message.id);
        if (idx < 0) return c;
        return { ...c, messages: c.messages.slice(0, idx) };
      })
    );
    setView(activeChat?.messages?.length > 1 ? 'agent' : 'home');
    showToast('Edit your prompt and send again');
  };

  const pinChat = (id) => setChats((all) => all.map((c) => (c.id === id ? { ...c, pinned: !c.pinned } : c)));
  const archiveChat = (id) =>
    setChats((all) => all.map((c) => (c.id === id ? { ...c, archived: !c.archived, pinned: false } : c)));
  const deleteChat = (id) => {
    setChats((all) => {
      const next = all.filter((c) => c.id !== id);
      if (!next.length) {
        const chat = defaultChat();
        setActiveChatId(chat.id);
        return [chat];
      }
      if (activeChatId === id) setActiveChatId(next[0].id);
      return next;
    });
  };

  /** Ensure each project has exactly one bound chat; open it (never create extras). */
  const ensureProjectChat = (project, existingChats = chats) => {
    const found = existingChats.find((c) => c.projectId === project.id && !c.archived);
    if (found) return found;
    return defaultChat({
      title: project.name || 'Project chat',
      projectId: project.id
    });
  };

  const openProject = (projectId, opts = {}) => {
    const project = projects.find((p) => p.id === projectId);
    if (!project) return;
    const mode = opts.mode || 'chat';
    setActiveProjectId(project.id);
    setSidebarTab(mode === 'chat' ? 'chats' : 'files');
    setOpenTabs((project.files || []).slice(0, 6).map((f) => f.path));
    if (!activeFile || !project.files?.some((f) => f.path === activeFile)) {
      setActiveFile(project.files?.[0]?.path || null);
    }
    if (project.liveUrl || project.previewUrl) {
      setBrowserUrl(project.liveUrl || project.previewUrl);
    }
    setChats((all) => {
      const bound = all.filter((c) => c.projectId === project.id && !c.archived);
      let chat = bound.find((c) => c.messages?.length) || bound[0];
      let next = all;
      if (!chat) {
        chat = ensureProjectChat(project, all);
        next = [chat, ...all];
      }
      setActiveChatId(chat.id);
      setProjects((ps) => ps.map((p) => (p.id === project.id ? { ...p, chatId: chat.id } : p)));
      if (mode === 'code') {
        setWorkspaceMode('code');
        setView('workspace');
      } else if (mode === 'files') {
        setWorkspaceMode('files');
        setView('files');
      } else if (mode === 'browser') {
        setWorkspaceMode('browser');
        setView('browser');
      } else {
        setWorkspaceMode('chat');
        setView(chat.messages?.length ? 'agent' : 'home');
      }
      return next;
    });
  };

  const newProject = async (name = 'New project') => {
    let project = defaultProject(name, {
      liveUrl: null,
      previewUrl: null,
      arrangedAt: Date.now()
    });
    // Prefer on-disk project so files + agent work survive logout
    if (bridge.isElectron) {
      try {
        const created = await bridge.createProjectFolder({ name, seedReadme: true });
        const loaded = await bridge.readFolderFiles(created.path);
        project = defaultProject(loaded.name || name, {
          id: project.id,
          rootPath: loaded.path,
          files: loaded.files || [],
          liveUrl: null,
          previewUrl: null,
          arrangedAt: Date.now()
        });
      } catch {
        /* keep in-memory project */
      }
    }
    const chat = defaultChat({ title: project.name, projectId: project.id });
    project.chatId = chat.id;
    setProjects((p) => [project, ...p]);
    setChats((c) => [chat, ...c.filter((x) => x.projectId !== project.id)]);
    setActiveProjectId(project.id);
    setActiveChatId(chat.id);
    setOpenTabs((project.files || []).slice(0, 4).map((f) => f.path));
    setActiveFile(project.files?.[0]?.path || null);
    setBrowserUrl('');
    setView('home');
    setSidebarTab('files');
    setWorkspaceMode('chat');
    setProjectMenuOpen(false);
    showToast(`Project “${project.name}” ready — its chat is open`);
    return project;
  };

  const saveRules = async () => {
    await persistRulesDurable(rules);
    showToast('Saved successfully');
  };

  const saveCustomize = async () => {
    await saveSettings({});
    showToast('Saved successfully');
  };

  const deleteProject = (id) => {
    setProjects((all) => {
      const next = all.filter((p) => p.id !== id);
      if (activeProjectId === id) {
        setActiveProjectId(next[0]?.id || null);
        setOpenTabs([]);
        setActiveFile(null);
      }
      return next;
    });
    showToast('Project deleted');
  };

  const maybeRefineRules = async () => {
    if (!settings.openRouterKey || learningBusy) return;
    setLearningBusy(true);
    try {
      const result = await refineSystemRules({
        apiKey: settings.openRouterKey,
        apiKeys: [settings.openRouterKey, settings.openRouterKey2],
        systemRules: compileSystemPrompt(rules),
        currentRules: rules
      });
      if (result.ok && result.rules) {
        setRules(result.rules);
        showToast('Learned your style — rules updated');
      }
    } catch (error) {
      showToast(`Learning skipped: ${error.message}`);
    } finally {
      setLearningBusy(false);
    }
  };

  const submitFeedback = async (message, action) => {
    const prompt =
      [...(activeChat?.messages || [])].reverse().find((m) => m.role === 'user')?.content || lastPromptRef.current;
    const payload = {
      action,
      model: settings.model,
      systemRules: compileSystemPrompt(rules),
      prompt,
      response: message?.content || '',
      files: message?.files || [],
      projectId: activeProjectId,
      chatId: activeChat?.id,
      messages: [
        { role: 'system', content: compileSystemPrompt(rules) },
        { role: 'user', content: prompt },
        { role: 'assistant', content: message?.content || '' }
      ]
    };
    await bridge.logTrainingPair(payload);
    setChats((all) =>
      all.map((c) =>
        c.id === activeChat?.id
          ? {
              ...c,
              messages: c.messages.map((m) => (m.id === message.id ? { ...m, feedback: action } : m))
            }
          : c
      )
    );
    showToast(action === 'accepted' ? 'Accepted — logged for learning' : 'Rejected — logged');
    if (action === 'accepted') maybeRefineRules();
  };

  const attachComposerFiles = async (fileList) => {
    const next = [];
    for (const file of [...(fileList || [])]) {
      try {
        const isZip =
          /\.zip$/i.test(file.name || '') ||
          file.type === 'application/zip' ||
          file.type === 'application/x-zip-compressed';
        if (isZip) {
          showToast('Unpacking zip for investigation…');
          const unpacked = await unpackZipFile(file);
          upsertFiles(unpacked.files, unpacked.name);
          await bridge.writeFiles(unpacked.files, currentRoot());
          next.push({
            id: `${Date.now()}-zip`,
            name: file.name,
            path: file.name,
            kind: 'zip',
            mime: 'application/zip',
            size: file.size,
            content: `ZIP unpacked: ${unpacked.files.length} text files imported into the project for analysis.`,
            previewNote: `${unpacked.files.length} files ready to investigate`
          });
          showToast(`Zip analyzed — ${unpacked.files.length} files imported`);
          continue;
        }
        const parsed = await readBrowserFile(file);
        next.push(parsed);
        if (parsed.kind === 'text') {
          upsertFiles([{ path: parsed.name, content: parsed.content }], activeProject?.name || 'Chat attachments', {
            skipOpen: true
          });
        }
      } catch (error) {
        showToast(error.message);
      }
    }
    if (!next.length) return;
    setAttachments((prev) => [...prev, ...next]);
    showToast(`Attached ${next.length} item(s)`);
  };

  const sendPrompt = async (raw) => {
    const text = (raw ?? composer).trim();
    if ((!text && !attachments.length) || busy) return;
    lastPromptRef.current = text;
    // Re-attach recent reference images from this chat if the user didn't re-upload
    let pendingAttachments = attachments;
    if (!pendingAttachments.some((a) => a.kind === 'image')) {
      const priorImgs = [];
      for (const m of [...(activeChat?.messages || [])].reverse()) {
        for (const a of m.attachments || []) {
          if (a.kind === 'image' && a.dataUrl && !priorImgs.some((x) => x.dataUrl === a.dataUrl)) {
            priorImgs.push(a);
          }
        }
        if (priorImgs.length >= 3) break;
      }
      if (priorImgs.length) pendingAttachments = [...pendingAttachments, ...priorImgs];
    }
    // Standalone New Chat stays in Chats. Project work stays on that project's chat.
    let chatId = null;
    if (activeChat && !activeChat.projectId) {
      chatId = activeChat.id;
    } else if (activeProjectId) {
      const bound =
        chats.find((c) => c.projectId === activeProjectId && !c.archived) ||
        (activeChat?.projectId === activeProjectId ? activeChat : null);
      if (bound) {
        chatId = bound.id;
        if (activeChatId !== bound.id) setActiveChatId(bound.id);
      } else {
        const chat = defaultChat({
          title: activeProject?.name || 'Project chat',
          projectId: activeProjectId
        });
        chatId = chat.id;
        setChats((c) => [chat, ...c]);
        setActiveChatId(chat.id);
        setProjects((ps) =>
          ps.map((p) => (p.id === activeProjectId ? { ...p, chatId: chat.id } : p))
        );
      }
    } else {
      chatId = activeChatId || chats[0]?.id;
      if (!chatId) {
        const chat = defaultChat();
        chatId = chat.id;
        setChats([chat]);
        setActiveChatId(chat.id);
      }
    }
    const display = text || `(attached ${attachments.map((a) => a.name).join(', ')})`;
    const userMessage = {
      id: uid(),
      role: 'user',
      content: display,
      // Persist what the user attached this turn (keep dataUrls so references stay viewable)
      attachments: attachments.map((a) => ({
        id: a.id,
        name: a.name,
        path: a.path,
        kind: a.kind,
        mime: a.mime,
        size: a.size,
        dataUrl: a.kind === 'image' ? a.dataUrl : undefined,
        previewNote: a.previewNote
      })),
      at: Date.now()
    };
    setChats((all) =>
      all.map((c) =>
        c.id === chatId
          ? {
              ...c,
              projectId: c.projectId,
              title: c.projectId
                ? c.messages.length
                  ? c.title
                  : activeProject?.name || c.title
                : c.title || 'New Chat',
              messages: [...c.messages, userMessage]
            }
          : c
      )
    );
    // Bind chat to active project
    if (activeProjectId) {
      setProjects((ps) =>
        ps.map((p) => (p.id === activeProjectId ? { ...p, chatId } : p))
      );
    }
    setComposer('');
    setAttachments([]);
    // Remember the brief on the project so later turns stay on-spec
    if (activeProjectId && text) {
      setProjects((ps) =>
        ps.map((p) =>
          p.id === activeProjectId
            ? {
                ...p,
                brief: text,
                briefAt: Date.now(),
                referenceNames: pendingAttachments.map((a) => a.name).filter(Boolean)
              }
            : p
        )
      );
    }
    setView('agent');
    setBusy(true);
    setStatus('Agent running');
    const assistantId = uid();
    setChats((all) =>
      all.map((c) =>
        c.id === chatId
          ? {
              ...c,
              messages: [
                ...c.messages,
                {
                  id: assistantId,
                  role: 'assistant',
                  content: '',
                  display: 'Forge Agent starting…',
                  progress: { stages: createAgentStages().map((s, i) => ({ ...s, status: i === 0 ? 'active' : 'pending' })) },
                  at: Date.now()
                }
              ]
            }
          : c
      )
    );
    const chat = chats.find((c) => c.id === chatId);
    const history = (chat?.messages || []).map((m) => ({ role: m.role, content: m.content }));
    const contextFiles = attachedPaths.length
      ? files.filter((f) => attachedPaths.includes(f.path))
      : files.filter((f) => isLikelyTextPath(f.path)).slice(0, 12);
    const previousFiles = projectsRef.current.find((p) => p.id === activeProjectIdRef.current)?.files || [];
    abortRef.current = new AbortController();

    const patchAssistant = (patch) => {
      setChats((all) =>
        all.map((c) =>
          c.id === chatId
            ? {
                ...c,
                messages: c.messages.map((m) => (m.id === assistantId ? { ...m, ...patch } : m))
              }
            : c
        )
      );
    };

    try {
      const result = await runForgeAgent({
        apiKey: settings.openRouterKey,
        apiKeys: [settings.openRouterKey, settings.openRouterKey2],
        model: settings.model,
        provider: settings.provider || 'openrouter',
        localBaseUrl: settings.localBaseUrl || 'http://127.0.0.1:11434',
        rules,
        history,
        prompt: (() => {
          const proj = projectsRef.current.find((p) => p.id === activeProjectIdRef.current);
          const base =
            text || 'Investigate attached / imported files, rearrange if needed, and continue the app.';
          if (proj?.brief && text && text !== proj.brief) {
            return `${base}\n\nPRIOR PROJECT BRIEF (stay faithful):\n${proj.brief}`;
          }
          return base;
        })(),
        contextFiles,
        attachments: pendingAttachments,
        previousFiles,
        githubConnected: Boolean(settings.githubToken && settings.githubUser),
        signal: abortRef.current.signal,
        onProgress: ({ stages, text: full, files: fileRefs, display, previewUrl, changes, activity, mode }) => {
          // Chat shows status only — never dump raw code into the bubble while building
          patchAssistant({
            content: mode === 'guide' ? full : full,
            display,
            files: fileRefs,
            changes,
            previewUrl,
            activity,
            mode,
            progress: { stages, complete: false }
          });
          if (fileRefs?.length && mode !== 'guide') {
            upsertFiles(fileRefs, projectNameFromPrompt(text), { skipOpen: true });
          }
        },
        deploy: async ({ name, files: deployFiles, isPrivate }) =>
          publishToGithub({ name, isPrivate, fileOverride: deployFiles })
      });

      if (result.files.length) {
        upsertFiles(result.files, result.projectName || projectNameFromPrompt(text));
        await bridge.writeFiles(result.files, currentRoot());
        setOpenTabs((tabs) => {
          const next = [...tabs];
          result.files.slice(0, 8).forEach((f) => {
            if (!next.includes(f.path)) next.push(f.path);
          });
          return next;
        });
        if (result.files[0]) setActiveFile(result.files[0].path);
        if (result.previewUrl) setBrowserUrl(result.previewUrl);
      }

      const summary = buildDeliverySummary({
        files: result.files,
        prose: result.display || (result.mode === 'guide' ? result.text : ''),
        liveUrl: result.previewUrl || result.deployResult?.live || ''
      });

      patchAssistant({
        content: result.text,
        display: result.display || chatFacingText(result.text, { files: result.files, previewUrl: result.previewUrl }),
        files: result.files,
        changes: result.changes,
        previewUrl: result.previewUrl || result.deployResult?.live || '',
        deployResult: result.deployResult,
        activity: result.activity,
        mode: result.mode,
        progress: {
          stages: result.stages,
          done: summary.done,
          next: summary.next,
          complete: true
        },
        deliveryComplete: true,
        error: Boolean(result.failedDelivery)
      });

      const writtenId = activeProjectIdRef.current || lastWriteProjectIdRef.current;
      setProjects((all) =>
        all.map((p) =>
          writtenId && p.id === writtenId
            ? {
                ...p,
                arrangedAt: Date.now(),
                liveUrl: result.deployResult?.live || (String(result.previewUrl || '').startsWith('http') ? result.previewUrl : p.liveUrl),
                previewUrl: result.previewUrl || p.previewUrl,
                chatId: activeChatId || p.chatId,
                name: p.files.length ? p.name : result.projectName || projectNameFromPrompt(text) || p.name
              }
            : p
        )
      );

      await bridge.logTrainingPair({
        action: result.failedDelivery ? 'failed-guide' : 'agent-built',
        model: settings.model,
        systemRules: compileSystemPrompt(rules),
        prompt: text,
        response: result.text,
        files: result.files,
        projectId: activeProjectId,
        chatId
      });

      if (result.files.length) {
        setStatus(`Agent done · ${result.files.length} files`);
        showToast(
          result.deployResult?.live
            ? `Built + deployed: ${result.deployResult.live}`
            : `Agent built ${result.files.length} files — Code / Preview ready`
        );
      } else {
        setStatus('Agent: no files');
        showToast('Agent got no files — retry, or switch Customize to a free model that is still listed');
      }
    } catch (error) {
      const message = error.name === 'AbortError' ? 'Generation stopped.' : explainModelError(error.message);
      setChats((all) =>
        all.map((c) =>
          c.id === chatId
            ? {
                ...c,
                messages: c.messages.map((m) =>
                  m.id === assistantId
                    ? {
                        ...m,
                        content: message,
                        display: message,
                        error: true,
                        progress: { complete: true, done: [message], next: ['Retry the prompt'], stages: m.progress?.stages || [] }
                      }
                    : m
                )
              }
            : c
        )
      );
      setStatus('Error');
      showToast(message);
    } finally {
      setBusy(false);
      abortRef.current = null;
      setStatus((s) => (s === 'Generating' ? 'Ready' : s));
    }
  };

  const stop = () => abortRef.current?.abort();

  const saveSettings = async (patch) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    persistSecrets(next);
    await bridge.saveSettings({
      model: next.model,
      workspaceRoot: next.workspaceRoot,
      provider: next.provider || 'openrouter',
      localBaseUrl: next.localBaseUrl || 'http://127.0.0.1:11434'
    });
  };

  const connectGithub = async (token) => {
    const user = await getGithubUser(token);
    const repos = await listRepos(token);
    await saveSettings({ githubToken: token, githubUser: user });
    setGithubRepos(repos);
    showToast(`Connected @${user.login}`);
    return user;
  };

  const publishToGithub = async ({ name, isPrivate, fileOverride } = {}) => {
    const payload =
      fileOverride?.length
        ? fileOverride
        : files.filter((f) => typeof f.content === 'string' && !String(f.content).startsWith('data:'));
    if (!payload.length) throw new Error('Generate or add files first.');
    const slug = String(name || activeProject?.name || 'forge-app')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80) || 'forge-app';
    const repo = await ensureRepo(settings.githubToken, {
      name: slug,
      description: 'Built with Forge AI Agent',
      isPrivate
    });
    const owner = repo.owner?.login || settings.githubUser?.login;
    await new Promise((r) => setTimeout(r, 800));
    await pushFiles(settings.githubToken, {
      owner,
      repo: repo.name,
      files: payload,
      message: 'Publish from Forge AI Agent'
    });
    let live = pagesUrl(owner, repo.name);
    let pagesReady = false;
    try {
      await enablePages(settings.githubToken, { owner, repo: repo.name, branch: repo.default_branch || 'main' });
      const pages = await waitForPages(settings.githubToken, { owner, repo: repo.name, attempts: 24 });
      if (pages?.html_url) live = pages.html_url.endsWith('/') ? pages.html_url : `${pages.html_url}/`;
      await setRepoHomepage(settings.githubToken, { owner, repo: repo.name, homepage: live });
      pagesReady = await probeLiveUrl(live);
    } catch (error) {
      showToast(`Repo published, Pages: ${error.message}`);
    }
    setProjects((all) =>
      all.map((p) =>
        p.id === (activeProjectIdRef.current || activeProjectId)
          ? {
              ...p,
              liveUrl: live,
              githubRepo: { owner, name: repo.name, url: repo.html_url, live },
              pagesReady
            }
          : p
      )
    );
    // Prefer live when it actually responds; otherwise keep local Generated preview so UI stays interactive
    if (pagesReady) setBrowserUrl(live);
    else if (activeProject?.previewUrl) setBrowserUrl(activeProject.previewUrl);
    setGithubRepos((r) => [repo, ...r.filter((x) => x.id !== repo.id)]);
    showToast(
      pagesReady
        ? `Live link ready: ${live}`
        : `Published — Pages still building. Preview uses local Generated until live is ready.`
    );
    return { repo, live, pagesReady };
  };

  const value = useMemo(
    () => ({
      theme,
      setTheme,
      view,
      setView,
      sidebarTab,
      setSidebarTab,
      chats,
      activeChat,
      activeChatId,
      setActiveChatId,
      projects,
      activeProject,
      activeProjectId,
      setActiveProjectId,
      files,
      setProjectFiles,
      upsertFiles,
      openTabs,
      setOpenTabs,
      activeFile,
      setActiveFile,
      attachedPaths,
      setAttachedPaths,
      attachments,
      setAttachments,
      attachComposerFiles,
      rules,
      setRules,
      addRule: () => setRules((r) => [...r, createBlankRule()]),
      prompts,
      setPrompts,
      activePromptId,
      setActivePromptId,
      settings,
      saveSettings,
      composer,
      setComposer,
      busy,
      status,
      terminal,
      setTerminal,
      terminalOpen,
      setTerminalOpen,
      settingsOpen,
      setSettingsOpen,
      searchOpen,
      setSearchOpen,
      projectMenuOpen,
      setProjectMenuOpen,
      githubRepos,
      setGithubRepos,
      toast,
      showToast,
      workspaceMode,
      setWorkspaceMode,
      browserUrl,
      setBrowserUrl,
      projectRoot,
      learningBusy,
      pinChat,
      archiveChat,
      deleteChat,
      newChat,
      requestNewChat,
      openChatsHome,
      openProject,
      renameProject,
      editUserMessage,
      newProject,
      deleteProject,
      relativeTime,
      saveRules,
      saveCustomize,
      submitFeedback,
      maybeRefineRules,
      sendPrompt,
      stop,
      connectGithub,
      publishToGithub,
      models: DEFAULT_MODELS,
      localModels,
      setLocalModels,
      isElectron: bridge.isElectron,
      runCommand: async (cmd) => {
        setTerminalOpen(true);
        setTerminal((t) => [...t, { id: uid(), stream: 'cmd', data: `$ ${cmd}` }]);
        const out = await bridge.runCommand(cmd, currentRoot());
        setTerminal((t) => [
          ...t,
          { id: uid(), stream: 'stdout', data: out.stdout || '' },
          { id: uid(), stream: 'stderr', data: out.stderr || '' }
        ]);
        return out;
      },
      updateFileContent: (path, content) => {
        setProjectFiles((all) => all.map((f) => (f.path === path ? { ...f, content } : f)));
        bridge.writeFiles([{ path, content }], currentRoot());
        // edited files become soft training signal
        bridge.logTrainingPair({
          action: 'edited',
          prompt: lastPromptRef.current,
          response: content,
          files: [{ path, content }],
          systemRules: compileSystemPrompt(rules),
          model: settings.model
        });
      },
      pickProjectFolder: async () => {
        if (bridge.isElectron) {
          const picked = await bridge.selectFolder({ title: 'Open project folder' });
          if (!picked.ok) return null;
          const loaded = await bridge.readFolderFiles(picked.path);
          const project = defaultProject(loaded.name, { rootPath: loaded.path, files: loaded.files || [] });
          const chat = defaultChat({ title: project.name, projectId: project.id });
          project.chatId = chat.id;
          setProjects((p) => [project, ...p]);
          setChats((c) => [chat, ...c]);
          setActiveProjectId(project.id);
          setActiveChatId(chat.id);
          setOpenTabs((project.files || []).slice(0, 6).map((f) => f.path));
          setActiveFile(project.files?.[0]?.path || null);
          setView(project.files.length ? 'agent' : 'home');
          setWorkspaceMode('chat');
          return project;
        }
        return { needsBrowserPicker: true };
      },
      createProjectOnDisk: async (name) => {
        const created = await bridge.createProjectFolder({ name, seedReadme: true });
        const loaded = await bridge.readFolderFiles(created.path);
        const project = defaultProject(loaded.name, { rootPath: loaded.path, files: loaded.files || [] });
        const chat = defaultChat({ title: project.name, projectId: project.id });
        project.chatId = chat.id;
        setProjects((p) => [project, ...p]);
        setChats((c) => [chat, ...c]);
        setActiveProjectId(project.id);
        setActiveChatId(chat.id);
        setOpenTabs((project.files || []).slice(0, 4).map((f) => f.path));
        setActiveFile(project.files?.[0]?.path || null);
        setView('home');
        setWorkspaceMode('chat');
        showToast(`Project “${project.name}” chat is open`);
        return project;
      },
      importBrowserFolder: async (fileList) => {
        const filesArr = [...fileList];
        const folderName = (filesArr[0]?.webkitRelativePath || 'Imported').split('/')[0];
        const incoming = [];
        for (const file of filesArr) {
          const parsed = await readBrowserFile(file);
          if (parsed.kind === 'text') {
            const path = (file.webkitRelativePath || file.name).replace(/\\/g, '/').replace(new RegExp(`^${folderName}/`), '');
            incoming.push({ path, content: parsed.content });
          }
        }
        const root = `browser://${folderName}`;
        await bridge.writeFiles(incoming, root);
        const project = defaultProject(folderName, { rootPath: root, files: incoming });
        const chat = defaultChat({ title: project.name, projectId: project.id });
        project.chatId = chat.id;
        setProjects((p) => [project, ...p]);
        setChats((c) => [chat, ...c]);
        setActiveProjectId(project.id);
        setActiveChatId(chat.id);
        setOpenTabs(incoming.slice(0, 6).map((f) => f.path));
        setActiveFile(incoming[0]?.path || null);
        setView(incoming.length ? 'agent' : 'home');
        setWorkspaceMode('chat');
        return project;
      },
      createFileInProject: async (relPath, content = '') => {
        const path = String(relPath || '').replace(/^[/\\]+/, '');
        upsertFiles([{ path, content }], activeProject?.name);
        await bridge.createPath({ root: currentRoot(), rel: path, type: 'file', content });
      },
      createFolderInProject: async (relPath) => {
        const path = String(relPath || '').replace(/^[/\\]+/, '');
        await bridge.createPath({ root: currentRoot(), rel: path, type: 'dir' });
      },
      importLocalFiles: async (fileList) => {
        const incoming = [];
        for (const file of fileList) {
          const parsed = await readBrowserFile(file);
          if (parsed.kind === 'text') incoming.push({ path: parsed.path || parsed.name, content: parsed.content });
        }
        upsertFiles(incoming, 'Imported files');
        setView('workspace');
      }
    }),
    [
      theme,
      view,
      sidebarTab,
      chats,
      activeChat,
      activeChatId,
      projects,
      activeProject,
      activeProjectId,
      files,
      openTabs,
      activeFile,
      attachedPaths,
      attachments,
      rules,
      prompts,
      activePromptId,
      settings,
      composer,
      busy,
      status,
      terminal,
      terminalOpen,
      settingsOpen,
      searchOpen,
      projectMenuOpen,
      githubRepos,
      toast,
      workspaceMode,
      browserUrl,
      projectRoot,
      learningBusy,
      localModels
    ]
  );

  return <ForgeContext.Provider value={value}>{children}</ForgeContext.Provider>;
}

export function useForge() {
  return useContext(ForgeContext);
}
