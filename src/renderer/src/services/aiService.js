import { completeChat } from './openRouterEngine.js';
import { compileSystemPrompt, detectSkill, SKILL_HINTS } from './rulesEngine.js';
import { extractFiles, extractCommands } from './fileParser.js';

export async function runForgePrompt({
  apiKey,
  apiKeys,
  model,
  rules,
  history,
  prompt,
  contextFiles,
  attachments,
  onToken,
  signal
}) {
  const skill = detectSkill(prompt);
  const extra = skill ? `SKILL MODE: ${skill}\n${SKILL_HINTS[skill]}` : '';
  const contextBlock = (contextFiles || [])
    .filter((file) => file && typeof file.content === 'string' && !String(file.content).startsWith('data:'))
    .map((file) => `FILE ${file.path}\n${file.content}`)
    .join('\n\n---\n\n');
  const textAttachments = (attachments || []).filter((a) => a.kind === 'text' || a.kind === 'binary');
  const imageAttachments = (attachments || []).filter((a) => a.kind === 'image' && a.dataUrl);
  const attachBlock = textAttachments
    .map((file) => `ATTACHED FILE ${file.path || file.name}\n${file.content || ''}`)
    .join('\n\n---\n\n');
  const historyMessages = (history || [])
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({ role: m.role, content: m.content }))
    .slice(-16);
  const textParts = [
    prompt || '(see attached files)',
    attachBlock ? `\n\nUSER ATTACHMENTS:\n${attachBlock}` : '',
    contextBlock ? `\n\nATTACHED WORKSPACE CONTEXT:\n${contextBlock}` : ''
  ].join('');
  let userContent = textParts;
  if (imageAttachments.length) {
    userContent = [
      { type: 'text', text: textParts },
      ...imageAttachments.map((img) => ({ type: 'image_url', image_url: { url: img.dataUrl } }))
    ];
  }
  const messages = [
    { role: 'system', content: compileSystemPrompt(rules, extra) },
    ...historyMessages,
    { role: 'user', content: userContent }
  ];
  const text = await completeChat({
    apiKey,
    apiKeys,
    model,
    messages,
    stream: true,
    onToken,
    signal
  });
  return { text, files: extractFiles(text), commands: extractCommands(text), skill };
}
