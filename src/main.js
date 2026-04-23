import { createApp, watch } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import i18n from './i18n'
import './styles/main.css'

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(i18n)

// 语言切换时同步更新浏览器标题（路由 meta.titleKey）
function applyDocumentTitleFromRoute(route) {
  const titleKey = route?.meta?.titleKey
  const pageTitle =
    typeof titleKey === 'string' && titleKey
      ? i18n.global.t(titleKey)
      : typeof route?.meta?.title === 'string' && route.meta.title
        ? route.meta.title
        : i18n.global.t('titles.fallback')
  document.title = `${pageTitle} - YHthestudio`
}

watch(
  () => i18n.global.locale.value,
  () => applyDocumentTitleFromRoute(router.currentRoute.value)
)

app.mount('#app')