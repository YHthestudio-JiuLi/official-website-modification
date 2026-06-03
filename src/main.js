import { createApp, watch } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import i18n from './i18n'
import { setDocumentTitle } from '@/utils/documentTitle'
import './styles/main.css'

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(i18n)

// 语言切换时同步更新浏览器标题（路由 meta.titleKey）
function applyDocumentTitleFromRoute(route) {
  setDocumentTitle(route, i18n.global.t)
}

watch(
  () => i18n.global.locale.value,
  () => applyDocumentTitleFromRoute(router.currentRoute.value)
)

app.mount('#app')