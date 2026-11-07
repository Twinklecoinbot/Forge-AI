# Forge AI

Standalone AI coding command center (Electron + React). Plans, builds, reviews, and deploys from prompts. Learns your coding style from Accept/Reject feedback.

## Run locally

```bash
npm install
npm run dev:web     # browser UI at http://localhost:5173
npm run dev         # Electron desktop
```

Open **Customize**, paste your OpenRouter key, then prompt.

## Self-improving learning loop

1. Generate code in Chat.
2. Click **Accept Code** or **Reject Code** on assistant messages.
3. Desktop app appends OpenAI-schema pairs to `workspace/training_dataset.jsonl` (browser uses localStorage fallback).
4. On Accept, Forge calls OpenRouter (`openrouter/free`) to refine a 5-bullet **Learned coding style** rule into `forge_rules` / `forge.rules`.
5. Future prompts inherit those rules automatically.

## CI/CD (every push to `main`)

| Workflow | Output |
|---|---|
| `build-exe.yml` | `Forge-AI-Setup.exe` on GitHub Releases (`latest`) |
| `deploy-preview.yml` | Live site on GitHub Pages |

Links (replace `USERNAME` / `REPO`):

- EXE: `https://github.com/USERNAME/REPO/releases/latest/download/Forge-AI-Setup.exe`
- Web: `https://USERNAME.github.io/REPO/`

Enable **Settings → Pages → GitHub Actions** once after first push.
