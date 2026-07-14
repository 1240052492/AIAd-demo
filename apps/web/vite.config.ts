import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// 仓库根目录（monorepo 单一 .env 配置源），使 Vite 能读到根目录的 VITE_* 变量
const repoRoot = path.resolve(__dirname, '..')

export default defineConfig({
  plugins: [react()],
  envDir: repoRoot,
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: true, // 同时监听 IPv4+IPv6，避免 localhost 解析到 ::1 时 127.0.0.1 连不上
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:4177',
        changeOrigin: true,
      },
      '/storage': {
        target: 'http://127.0.0.1:4177',
        changeOrigin: true,
      },
    },
  },
})
