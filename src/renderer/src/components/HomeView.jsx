import { Bug, Database, Rocket, ScrollText } from 'lucide-react';
import { useForge } from '../store/ForgeContext.jsx';
import Composer from './Composer.jsx';

const actions = [
  { icon: Rocket, title: 'Deploy my prototype', sub: 'Put a project on a shareable live link', go: 'github' },
  { icon: Database, title: 'Review my workspace', sub: 'Check schema, files, and risky gaps', prompt: '/review Review every file and patch bugs.' },
  { icon: ScrollText, title: 'Start with a plan', sub: 'Align on implementation before writing code', prompt: '/plan Design architecture then starter files.' },
  { icon: Bug, title: 'Debug an issue', sub: 'Find root causes and fix tricky bugs', prompt: '/debug Debug the current workspace and write fixes.' }
];

export default function HomeView() {
  const { sendPrompt, setView } = useForge();
  return (
    <div className="flex min-h-full flex-col items-center px-6 py-10 forge-fade">
      <div className="mt-8 w-full max-w-[760px]"><Composer /></div>
      <div className="mt-4 flex gap-2">
        <button onClick={() => sendPrompt('/plan Design a production web app and generate starter files.')} className="rounded-full border border-[var(--border)] px-3 py-1.5 text-[12.5px] text-[var(--text-muted)] hover:bg-[var(--bg-hover)]">Plan New Idea</button>
        <button onClick={() => sendPrompt('/build Generate a complete app shell and core files.')} className="rounded-full border border-[var(--border)] px-3 py-1.5 text-[12.5px] text-[var(--text-muted)] hover:bg-[var(--bg-hover)]">Multitask</button>
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
