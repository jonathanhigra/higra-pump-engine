import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const BACKEND = 'http://localhost:8000'

// All API path prefixes that should be proxied to the backend in dev mode.
// Keep in sync with frontend/nginx.conf location rules.
const API_PREFIXES = [
  '/api',
  '/health',
  '/docs',
  '/openapi.json',
  '/redoc',
  '/sizing',
  '/volute',
  '/pipeline',
  '/assistant',
  '/surrogate',
  '/geometry',
  '/optimize',
  '/analyze',
  '/curves',
  '/auth',
  '/batch',
  '/noise',
  '/report',
  '/version',
  '/inverse',
  '/blade',
  '/domain',
  '/blockage',
  '/ansys',
  '/lean-sweep',
  '/mri',
  '/turbo',
  '/lete',
  '/rrs',
  '/template',
  '/db',
  '/convergence',
  '/udp',
  '/cfd',
]

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      // WebSocket — must come first
      '/ws': {
        target: BACKEND,
        ws: true,
        changeOrigin: true,
      },
      // All REST API routes
      ...Object.fromEntries(
        API_PREFIXES.map(p => [p, { target: BACKEND, changeOrigin: true }]),
      ),
    },
  },
})
