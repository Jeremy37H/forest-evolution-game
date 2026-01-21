import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
  server: {
    // **** 關鍵修正點：暫時停用 CSP ****
    // 我們將整個 headers 區塊註解掉。
    // 這樣 Vite 開發伺服器就不會發送任何 CSP 規則，
    // 瀏覽器也就不會再阻擋任何腳本或連線。
    // 這是在本地開發時解決頑固快取問題最有效的方法。
    /*
    headers: {
      'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline' cdn.tailwindcss.com cdn.socket.io; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' http://localhost:3001 ws://localhost:3001;"
    },
    */
    hmr: {
      protocol: 'ws',
      host: 'localhost',
    }
  }
})