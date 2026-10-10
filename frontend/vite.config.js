import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 奇遇广场前端：Vite 托管 React 应用，开发环境 /api 代理到后端（:3101）。
//
// base：部署到 GitHub Pages 子路径时用 VITE_BASE 指定（如 /merged-forum/），
//       本地开发留空即为 '/'。
export default defineConfig({
  base: process.env.VITE_BASE || '/',
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
