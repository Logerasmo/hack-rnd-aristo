import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/graph': {
        target: 'http://localhost:8081',
        changeOrigin: true, // Рекомендуется добавить и сюда
      }, // <--- ЗДЕСЬ НЕ ХВАТАЛО ЗАКРЫВАЮЩЕЙ СКОБКИ И ЗАПЯТОЙ
      '/api': {
        target: 'http://localhost:8081',
        changeOrigin: true,
      }
    }
  }
})