import { useForge } from './store/ForgeContext.jsx';
import Sidebar from './components/Sidebar.jsx';
import Header from './components/Header.jsx';
import HomeView from './components/HomeView.jsx';
import AgentView from './components/AgentView.jsx';
import EditorPane from './components/EditorPane.jsx';
import ChatPanel from './components/ChatPanel.jsx';
import FilesExplorer from './components/FilesExplorer.jsx';
import BrowserPane from './components/BrowserPane.jsx';
import ChangesPanel from './components/ChangesPanel.jsx';
import TerminalPane from './components/TerminalPane.jsx';
import RulesPanel from './components/RulesPanel.jsx';
import GitHubPanel from './components/GitHubPanel.jsx';
import PromptsPanel from './components/PromptsPanel.jsx';
import SettingsModal from './components/SettingsModal.jsx';
import SearchModal from './components/SearchModal.jsx';
import StatusBar from './components/StatusBar.jsx';
import IdePanel from './components/IdePanel.jsx';

export default function App() {
  const { view, toast } = useForge();

  return (
    <div className="flex h-full flex-col bg-[var(--bg)] text-[var(--text)]">
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Header />
          <main className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
            <div className="forge-scroll flex min-h-0 min-w-0 flex-1 flex-col">
              {view === 'home' && <HomeView />}
              {view === 'agent' && <AgentView />}
              {view === 'workspace' && (
                <div className="flex min-h-0 flex-1">
                  <EditorPane />
                  <ChatPanel />
                </div>
              )}
              {view === 'files' && <FilesExplorer />}
              {view === 'browser' && <BrowserPane />}
              {view === 'changes' && <ChangesPanel />}
              {view === 'rules' && <RulesPanel />}
              {view === 'github' && <GitHubPanel />}
              {view === 'prompts' && <PromptsPanel />}
            </div>
            {(view === 'home' || view === 'agent') && <IdePanel />}
          </main>
          <TerminalPane />
          <StatusBar />
        </div>
      </div>
      <SettingsModal />
      <SearchModal />
      {toast && (
        <div className="fixed bottom-12 left-1/2 z-50 -translate-x-1/2 rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2 text-[12.5px] shadow-xl">
          {toast}
        </div>
      )}
    </div>
  );
}
