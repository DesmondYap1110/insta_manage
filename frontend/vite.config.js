import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Vite is the dev server + build tool. `server.proxy` forwards any request
// the frontend makes to /api/* or /files/* straight to the FastAPI backend,
// so the React app can just call fetch('/api/...') without hardcoding a host.
// Note: downloaded media is served from /files (not /media) so it doesn't
// collide with the frontend's own client-side /media route (Media Library page).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    allowedHosts: ['insta_manage.com', '.insta_manage.com'],
    proxy: {
      '/api': 'http://127.0.0.1:8000',
      '/files': 'http://127.0.0.1:8000',
    },
  },
})
