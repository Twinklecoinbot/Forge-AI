const { defineConfig } = require('vite');
const react = require('@vitejs/plugin-react');
const path = require('node:path');
const fs = require('node:fs');

function localSecretsPlugin() {
  return {
    name: 'forge-local-secrets',
    configureServer(server) {
      server.middlewares.use('/__forge_secrets', (_req, res) => {
        const envPath = path.join(__dirname, '.env.local');
        const data = {};
        if (fs.existsSync(envPath)) {
          for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
            const match = line.match(/^(OPENROUTER_API_KEY_2|OPENROUTER_API_KEY)=(.*)$/);
            if (!match) continue;
            const value = match[2].trim();
            if (match[1] === 'OPENROUTER_API_KEY') data.openRouterKey = value;
            if (match[1] === 'OPENROUTER_API_KEY_2') data.openRouterKey2 = value;
          }
        }
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(data));
      });
    }
  };
}

module.exports = defineConfig({
  root: path.join(__dirname, 'src/renderer'),
  plugins: [react(), localSecretsPlugin()],
  base: './',
  publicDir: path.join(__dirname, 'src/renderer/public'),
  build: {
    outDir: path.join(__dirname, 'dist'),
    emptyOutDir: true,
    sourcemap: false
  },
  server: {
    port: 5173,
    strictPort: true,
    host: true
  },
  preview: {
    port: 4173,
    host: true
  }
});
