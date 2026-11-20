import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'

// The Pyodide worker imports backend/rules.py and backend/knowledge.py with
// Vite's ?raw loader so there is only one copy of the rule engine.
const repoRoot = fileURLToPath(new URL('..', import.meta.url))

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    fs: {
      allow: [repoRoot],
    },
  },
  worker: {
    format: 'es',
  },
})
