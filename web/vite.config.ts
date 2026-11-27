import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

const DEFAULT_API_URL = 'http://127.0.0.1:3001'

// The app requests /api on its own origin; the dev and preview servers forward that to the API.
// BAGFLOW_API_URL, from the environment or a web/.env* file, says where the API is.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, import.meta.dirname, 'BAGFLOW_')
  const proxy = { '/api': env.BAGFLOW_API_URL || DEFAULT_API_URL }
  return {
    plugins: [react(), tailwindcss()],
    server: { proxy },
    preview: { proxy },
  }
})
