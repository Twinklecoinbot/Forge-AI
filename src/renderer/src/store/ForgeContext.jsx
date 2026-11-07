import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { bridge } from '../services/bridge.js';
import { DEFAULT_MODELS } from '../services/openRouterEngine.js';
import { STARTER_RULES, createBlankRule, compileSystemPrompt } from '../services/rulesEngine.js';
import { runForgePrompt } from '../services/aiService.js';
import {
  isLikelyTextPath,
  languageFromPath,
  projectNameFromPrompt,
  readBrowserFile
} from '../services/fileParser.js';
import {
  createRepo,
  enablePages,
  getGithubUser,
  listRepos,
  pagesUrl,
  pushFiles,
  setRepoHomepage,
  waitForPages
} from '../services/githubService.js';
import { loadPersistedRules, persistRules, refineSystemRules } from '../services/ruleRefiner.js';
import { buildDeliverySummary, buildLiveProgress } from '../services/chatPresentation.js';
import { unpackZipFile } from '../services/archiveService.js';

const ForgeContext = createContext(null);
const uid = () => Math.random().toString(36).slice(2, 10);

const defaultChat = () => ({
  id: uid(),
  title: 'New Chat',
  messages: [],
  createdAt: Date.now(),
  pinned: false,
  archived: false
});

const defaultProject = (name = 'Untitled project', extras = {}) => ({
  id: uid(),
  name,
  files: [],
  rootPath: null,
  githubRepo: null,
  liveUrl: null,
  arrangedAt: Date.now(),
  createdAt: Date.now(),
  ...extras
});

export function ForgeProvider({ children }) {
  const [theme, setTheme] = useState(() => localStorage.getItem('forge.theme') || 'dark');
  const [view, setView] = useState('home');
  const [sidebarTab, setSidebarTab] = useState('chats');
  const [chats, setChats] = useState([defaultChat()]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [projects, setProjects] = useState([]);
  const [activeProjectId, setActiveProjectId] = useState(null);
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
    model: 'openrouter/free',
    workspaceRoot: '',
    githubUser: null
  });
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

  const activeProject = projects.find((p) => p.id === activeProjectId) || null;
  const files = activeProject?.files || [];
  const activeChat = chats.find((c) => c.id === activeChatId) || chats[0];
  const projectRoot = activeProject?.rootPath || settings.workspaceRoot || null;

  useEffect(() => {
    projectsRef.current = projects;
  }, [projects]);
  useEffect(() => {
    activeProjectIdRef.current = activeProjectId;
  }, [activeProjectId]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('forge.theme', theme);
  }, [theme]);

  useEffect(() => {
    if (!activeChatId && chats[0]) setActiveChatId(chats[0].id);
  }, [activeChatId, chats]);

  useEffect(() => {
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
      setSettings((s) => ({
        ...s,
        ...loaded,
        openRouterKey: local.openRouterKey || seeded.openRouterKey || '',
        openRouterKey2: local.openRouterKey2 || seeded.openRouterKey2 || '',
        githubToken: local.githubToken || '',
        model: local.model || loaded.model || 'openrouter/free',
        workspaceRoot: loaded.workspaceRoot || s.workspaceRoot
      }));
      const persistedProjects = localStorage.getItem('forge.projects');
      if (persistedProjects) {
        const parsed = JSON.parse(persistedProjects);
        setProjects(parsed);
        if (parsed[0]) setActiveProjectId(parsed[0].id);
      }
      const persistedChats = localStorage.getItem('forge.chats');
      if (persistedChats) {
        const parsed = JSON.parse(persistedChats);
        if (parsed.length) {
          setChats(parsed);
          setActiveChatId(parsed[0].id);
        }
      }
      const persistedPrompts = localStorage.getItem('forge.prompts');
      if (persistedPrompts) setPrompts(JSON.parse(persistedPrompts));
    })();
    return bridge.onTerminalStream((chunk) => setTerminal((t) => [...t, { id: uid(), ...chunk }]));
  }, []);

  useEffect(() => {
    localStorage.setItem('forge.prompts', JSON.stringify(prompts));
  }, [prompts]);
  useEffect(() => {
    try {
      localStorage.setItem('forge.projects', JSON.stringify(projects));
    } catch {
      /* quota */
    }
  }, [projects]);
  useEffect(() => {
    try {
      localStorage.setItem('forge.chats', JSON.stringify(chats.slice(0, 40)));
    } catch {
      /* quota */
    }
  }, [chats]);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        newChat();
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
        model: next.model
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
    let targetId = activeProjectId;
    setProjects((prev) => {
      let list = prev;
      if (!list.length || !targetId) {
        const created = defaultProject(projectName || 'Untitled project');
        targetId = created.id;
        list = [created, ...list];
        setActiveProjectId(created.id);
      }
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
    const chat = defaultChat();
    setChats((c) => [chat, ...c]);
    setActiveChatId(chat.id);
    setView('home');
    setSidebarTab('chats');
    setComposer('');
    setAttachedPaths([]);
    setAttachments([]);
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

  const newProject = () => {
    const project = defaultProject('New project', {
      liveUrl: null,
      arrangedAt: Date.now()
    });
    setProjects((p) => [project, ...p]);
    setActiveProjectId(project.id);
    setOpenTabs([]);
    setActiveFile(null);
    setBrowserUrl('');
    setView('home');
    setSidebarTab('files');
    setProjectMenuOpen(false);
    showToast('Project ready — files will arrange into Code; publish for a live link');
  };

  const saveRules = async () => {
    persistRules(rules);
    await bridge.saveSettings({ rulesUpdatedAt: Date.now() });
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
    const chatId = activeChatId || chats[0]?.id;
    const display = text || `(attached ${attachments.map((a) => a.name).join(', ')})`;
    const pendingAttachments = attachments;
    const userMessage = {
      id: uid(),
      role: 'user',
      content: display,
      attachments: pendingAttachments.map((a) => ({
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
              projectId: activeProjectId || c.projectId,
              title: c.messages.length ? c.title : display.slice(0, 42),
              messages: [...c.messages, userMessage]
            }
          : c
      )
    );
    setComposer('');
    setAttachments([]);
    setView('agent');
    setBusy(true);
    setStatus('Generating');
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
                  progress: buildLiveProgress('', true),
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
    abortRef.current = new AbortController();
    try {
      const result = await runForgePrompt({
        apiKey: settings.openRouterKey,
        apiKeys: [settings.openRouterKey, settings.openRouterKey2],
        model: settings.model,
        rules,
        history,
        prompt: text || 'Investigate attached / imported files, rearrange if needed, and continue the app.',
        contextFiles,
        attachments: pendingAttachments,
        signal: abortRef.current.signal,
        onToken: (_t, full) => {
          const progress = buildLiveProgress(full, true);
          setChats((all) =>
            all.map((c) =>
              c.id === chatId
                ? {
                    ...c,
                    messages: c.messages.map((m) =>
                      m.id === assistantId
                        ? { ...m, content: full, progress, files: progress.filePaths.map((path) => ({ path })) }
                        : m
                    )
                  }
                : c
            )
          );
        }
      });

      if (result.files.length) {
        upsertFiles(result.files, projectNameFromPrompt(text));
        await bridge.writeFiles(result.files, currentRoot());
        setOpenTabs((tabs) => {
          const next = [...tabs];
          result.files.slice(0, 6).forEach((f) => {
            if (!next.includes(f.path)) next.push(f.path);
          });
          return next;
        });
        if (result.files[0]) setActiveFile(result.files[0].path);
      }

      const liveUrl = activeProject?.githubRepo?.live || activeProject?.liveUrl || '';
      const summary = buildDeliverySummary({
        files: result.files,
        prose: result.text,
        liveUrl
      });
      const progress = {
        ...buildLiveProgress(result.text, false),
        done: summary.done,
        next: summary.next,
        complete: true
      };

      setChats((all) =>
        all.map((c) =>
          c.id === chatId
            ? {
                ...c,
                messages: c.messages.map((m) =>
                  m.id === assistantId
                    ? {
                        ...m,
                        content: result.text,
                        files: result.files,
                        progress,
                        deliveryComplete: true
                      }
                    : m
                )
              }
            : c
        )
      );

      setProjects((all) =>
        all.map((p) =>
          p.id === (activeProjectId || p.id)
            ? { ...p, arrangedAt: Date.now(), name: p.files.length ? p.name : projectNameFromPrompt(text) || p.name }
            : p
        )
      );

      await bridge.logTrainingPair({
        action: 'generated',
        model: settings.model,
        systemRules: compileSystemPrompt(rules),
        prompt: text,
        response: result.text,
        files: result.files,
        projectId: activeProjectId,
        chatId
      });

      if (result.files.length) {
        setStatus(`Done · ${result.files.length} files in Code`);
        showToast(`Delivery complete — ${result.files.length} files in Code`);
      } else {
        setStatus('Done');
        showToast('Delivery complete');
      }
    } catch (error) {
      const message = error.name === 'AbortError' ? 'Generation stopped.' : error.message;
      setChats((all) =>
        all.map((c) =>
          c.id === chatId
            ? {
                ...c,
                messages: c.messages.map((m) =>
                  m.id === assistantId
                    ? {
                        ...m,
                        content: m.content || message,
                        error: true,
                        progress: { complete: true, done: [message], next: ['Retry the prompt'], stages: [] }
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
    await bridge.saveSettings({ model: next.model, workspaceRoot: next.workspaceRoot });
  };

  const connectGithub = async (token) => {
    const user = await getGithubUser(token);
    const repos = await listRepos(token);
    await saveSettings({ githubToken: token, githubUser: user });
    setGithubRepos(repos);
    showToast(`Connected @${user.login}`);
    return user;
  };

  const publishToGithub = async ({ name, isPrivate }) => {
    if (!files.length) throw new Error('Generate or add files first.');
    const repo = await createRepo(settings.githubToken, { name, description: 'Built with Forge AI', isPrivate });
    const owner = repo.owner.login;
    await new Promise((r) => setTimeout(r, 800));
    await pushFiles(settings.githubToken, {
      owner,
      repo: repo.name,
      files: files.filter((f) => typeof f.content === 'string' && !f.content.startsWith('data:')),
      message: 'Publish from Forge AI'
    });
    let live = pagesUrl(owner, repo.name);
    try {
      await enablePages(settings.githubToken, { owner, repo: repo.name, branch: repo.default_branch || 'main' });
      const pages = await waitForPages(settings.githubToken, { owner, repo: repo.name });
      if (pages?.html_url) live = pages.html_url.endsWith('/') ? pages.html_url : `${pages.html_url}/`;
      await setRepoHomepage(settings.githubToken, { owner, repo: repo.name, homepage: live });
    } catch (error) {
      showToast(`Repo published, Pages: ${error.message}`);
      live = repo.html_url;
    }
    setProjects((all) =>
      all.map((p) =>
        p.id === activeProjectId
          ? { ...p, liveUrl: live, githubRepo: { owner, name: repo.name, url: repo.html_url, live } }
          : p
      )
    );
    if (String(live).includes('github.io')) setBrowserUrl(live);
    setGithubRepos((r) => [repo, ...r]);
    showToast(`Live link updated: ${live}`);
    return { repo, live };
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
      newProject,
      deleteProject,
      saveRules,
      saveCustomize,
      submitFeedback,
      maybeRefineRules,
      sendPrompt,
      stop,
      connectGithub,
      publishToGithub,
      models: DEFAULT_MODELS,
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
          setProjects((p) => [project, ...p]);
          setActiveProjectId(project.id);
          setView(project.files.length ? 'workspace' : 'home');
          return project;
        }
        return { needsBrowserPicker: true };
      },
      createProjectOnDisk: async (name) => {
        const created = await bridge.createProjectFolder({ name, seedReadme: true });
        const loaded = await bridge.readFolderFiles(created.path);
        const project = defaultProject(loaded.name, { rootPath: loaded.path, files: loaded.files || [] });
        setProjects((p) => [project, ...p]);
        setActiveProjectId(project.id);
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
        setProjects((p) => [project, ...p]);
        setActiveProjectId(project.id);
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
      learningBusy
    ]
  );

  return <ForgeContext.Provider value={value}>{children}</ForgeContext.Provider>;
}

export function useForge() {
  return useContext(ForgeContext);
}
