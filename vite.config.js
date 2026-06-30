import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

/** 注入站点 URL，供 index.html 中 Open Graph 使用（Telegram 等链接预览） */
function siteMetaPlugin(siteUrl) {
  const base = String(siteUrl || 'https://yhthestudio.com').replace(/\/$/, '')
  const ogImage = `${base}/og-image.jpg`
  return {
    name: 'html-site-meta',
    transformIndexHtml(html) {
      return html
        .replaceAll('__SITE_URL__', base)
        .replaceAll('__OG_IMAGE__', ogImage)
        .replaceAll('__OG_IMAGE_WIDTH__', '1200')
        .replaceAll('__OG_IMAGE_HEIGHT__', '630')
    }
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const siteUrl = env.VITE_SITE_URL || 'https://yhthestudio.com'

  return {
  plugins: [vue(), siteMetaPlugin(siteUrl)],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    },
    extensions: ['.js', '.vue', '.json']
  },
  server: {
    port: 5173,
    proxy: {
      // Laravel v2 API（须在 /api 之前）
      '/api/v2': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        secure: false
      },
      '/sanctum': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        secure: false
      },
      '/ws': {
        target: 'http://localhost:3000',
        ws: true,
        changeOrigin: true
      },
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      },
      // 商品图等静态资源由 Node 的 /uploads 提供；开发时页面在 5173，需代理否则图片 404
      '/uploads': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: 'dist',
    // 宝塔会在网站目录下自动生成 dist/.user.ini（常带不可变属性），Vite 默认会先清空 outDir，rm 该文件会 EPERM
    emptyOutDir: false,
    sourcemap: false,
    // element-plus 独立 vendor chunk 约 916KB，阈值设为 1000 仅放宽该场景，仍保留对后续膨胀的告警能力
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: {
          'vue-vendor': ['vue', 'vue-router', 'pinia'],
          'i18n': ['vue-i18n'],
          'element-plus': ['element-plus']
        }
      }
    }
  }
}})