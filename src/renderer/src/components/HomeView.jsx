import { Bug, Database, Rocket, ScrollText } from 'lucide-react';
import { useForge } from '../store/ForgeContext.jsx';
import Composer from './Composer.jsx';

const actions = [
  { icon: Rocket, title: 'Build & deploy a prototype', sub: 'Generate the app, then publish a live link', go: 'github' },
  { icon: Database, title: 'Review & patch my workspace', sub: 'Find gaps and write the fixes into Code', prompt: '/review Review every file and emit patched files.' },
  { icon: ScrollText, title: 'Scaffold a production app', sub: 'Architecture plus working starter files now', prompt: '/build Design the tree and generate the runnable starter files.' },
  { icon: Bug, title: 'Debug and fix', sub: 'Root-cause the bug and write corrected files', prompt: '/debug Debug the current workspace and write fixes.' }
];

export default function HomeView() {
  const { sendPrompt, setView } = useForge();
  return (
    <div className="flex min-h-full flex-col items-center px-6 py-10 forge-fade">
      <div className="mt-8 w-full max-w-[760px]">
        <Composer />
      </div>
      <div className="mt-4 flex gap-2">
        <button
          onClick={() =>
            sendPrompt(
              '/build Build a complete production web app end-to-end. Emit all files into Code, arrange the tree, and open Preview. No guides.'
            )
          }
          className="rounded-full border border-[var(--border)] px-3 py-1.5 text-[12.5px] text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
        >
          Agent build
        </button>
        <button
          onClick={() =>
            sendPrompt(
              '/deploy Build a full-stack app, arrange files, open Preview, and deploy to GitHub Pages for a live URL.'
            )
          }
          className="rounded-full border border-[var(--border)] px-3 py-1.5 text-[12.5px] text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
        >
          Build + deploy
        </button>
      </div>
      <div className="mt-10 w-full max-w-[760px] divide-y divide-[var(--border)] pb-8">
        {actions.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.title}
              onClick={() => (item.go ? setView(item.go) : sendPrompt(item.prompt))}
              className="flex w-full items-center gap-3 px-1 py-3 text-left hover:bg-[var(--bg-hover)]"
            >
              <Icon size={18} className="text-[var(--text-muted)]" />
              <div>
                <div className="text-[13.5px]">{item.title}</div>
                <div className="text-[12px] text-[var(--text-muted)]">{item.sub}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
