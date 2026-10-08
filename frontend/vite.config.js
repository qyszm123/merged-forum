import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 奇遇广场前端：Vite 托管 React 应用，/api 代理到后端（:3100）
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3101',
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
})
