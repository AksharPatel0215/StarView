import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Use the patched sanitizer instead of Monaco's embedded 3.4.15 copy.
  resolve: { alias: [{ find: './dompurify/dompurify.js', replacement: fileURLToPath(new URL('./node_modules/dompurify/dist/purify.es.mjs', import.meta.url)) }] },
  server: { host: "127.0.0.1", proxy: { "/api": { target: process.env.STARVIEW_API_PROXY || "http://127.0.0.1:8000", changeOrigin: false } } },
})

