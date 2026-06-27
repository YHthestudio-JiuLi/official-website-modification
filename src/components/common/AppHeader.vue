<template>
  <header class="navbar">
    <div class="container">
      <router-link to="/" class="nav-brand">
        <img src="/favicon.png" alt="YHthestudio" class="nav-brand-icon" width="32" height="32" />
        <span>YHthestudio</span>
      </router-link>

      <ul class="nav-menu" :class="{ active: menuOpen }">
        <li><router-link to="/" class="nav-link">{{ $t('nav.home') }}</router-link></li>
        <li><router-link to="/products" class="nav-link">{{ $t('nav.products') }}</router-link></li>
        <li><router-link to="/forum" class="nav-link">{{ $t('nav.forum') }}</router-link></li>
        <li><router-link to="/chat" class="nav-link">{{ $t('nav.chat') }}</router-link></li>
        <!-- 产品页：搜索放在主导航与工具区之间（桌面）；移动端用顶栏第二行副本，避免藏在 fixed 抽屉里 -->
        <li v-if="showProductsSearch" class="nav-products-search-li nav-products-search-desktop">
          <div class="nav-products-search-wrap">
            <div class="nav-products-search">
              <i class="fas fa-search" aria-hidden="true" />
              <input
                type="search"
                enterkeyhint="search"
                autocomplete="off"
                :placeholder="productsSearchPlaceholder"
                :value="productsSearchLocal"
                @input="onProductsSearchInput"
              />
            </div>
          </div>
        </li>
        <!-- 桌面端弹性占位：主导航靠左、工具区靠右，避免整栏菜单挤在极右侧 -->
        <li class="nav-menu-spacer" aria-hidden="true" />

        <!-- 语言切换 -->
        <li class="lang-switcher">
          <button
            type="button"
            class="lang-btn"
            :title="$t('language.switch')"
            :aria-label="$t('language.switch')"
            @click="toggleLanguage"
          >
            <i class="fas fa-globe" aria-hidden="true" />
            <span class="lang-btn-label">{{ currentLang === 'zh' ? $t('language.zh') : $t('language.en') }}</span>
          </button>
        </li>

        <template v-if="authStore.isLoggedIn">
          <li>
            <router-link to="/orders" class="nav-link">
              <i class="fas fa-list"></i> {{ $t('nav.myOrders') }}
            </router-link>
          </li>
          <li class="nav-user">
            <div class="nav-user-inner">
              <div class="nav-user-profile">
                <div class="user-avatar-display">
                  <span class="avatar-letter">{{ getUserAvatarLetter(authStore.username) }}</span>
                </div>
                <span class="user-name" :title="authStore.username">{{ authStore.username }}</span>
              </div>
              <button type="button" class="nav-user-logout" @click="handleLogout">
                <i class="fas fa-sign-out-alt" aria-hidden="true" />
                {{ $t('nav.logout') }}
              </button>
            </div>
          </li>
        </template>

        <template v-else>
          <li><router-link :to="loginRoute" class="nav-link">{{ $t('nav.login') }}</router-link></li>
          <li>
            <router-link :to="registerRoute" class="nav-link btn-primary">
              {{ $t('nav.register') }}
            </router-link>
          </li>
        </template>
      </ul>

      <div class="nav-toggle" @click="menuOpen = !menuOpen">
        <span></span>
        <span></span>
        <span></span>
      </div>

      <div v-if="showProductsSearch" class="nav-products-search-bar">
        <div class="nav-products-search-wrap">
          <div class="nav-products-search">
            <i class="fas fa-search" aria-hidden="true" />
            <input
              type="search"
              enterkeyhint="search"
              autocomplete="off"
              :placeholder="productsSearchPlaceholder"
              :value="productsSearchLocal"
              @input="onProductsSearchInput"
            />
          </div>
        </div>
      </div>
    </div>
  </header>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { setLanguage } from '@/i18n'
import { buildLoginRoute, buildRegisterRoute, resolveRedirectFromRoute } from '@/utils/authRedirect'

const authStore = useAuthStore()
const route = useRoute()
const router = useRouter()
const { locale, t } = useI18n()
const menuOpen = ref(false)

const authRedirectTarget = computed(() => resolveRedirectFromRoute(route))
const loginRoute = computed(() => buildLoginRoute(authRedirectTarget.value))
const registerRoute = computed(() => buildRegisterRoute(authRedirectTarget.value))

const showProductsSearch = computed(() => route.name === 'products')
const productsSearchPlaceholder = computed(() => t('products.searchPlaceholder'))
const productsSearchLocal = ref('')

watch(
  () => [route.name, route.query.q],
  () => {
    if (route.name === 'products') {
      const q = route.query.q
      productsSearchLocal.value = typeof q === 'string' ? q : Array.isArray(q) ? q[0] || '' : ''
    } else {
      productsSearchLocal.value = ''
    }
  },
  { immediate: true }
)

let productsSearchDebounce = null
function onProductsSearchInput(e) {
  const v = e.target.value
  productsSearchLocal.value = v
  clearTimeout(productsSearchDebounce)
  productsSearchDebounce = setTimeout(() => {
    if (route.name !== 'products') return
    const q = v.trim()
    const nextQuery = { ...route.query }
    if (q) nextQuery.q = q
    else delete nextQuery.q
    router.replace({ name: 'products', query: nextQuery })
  }, 280)
}

onBeforeUnmount(() => {
  clearTimeout(productsSearchDebounce)
})

const currentLang = computed(() => locale.value)

onMounted(() => {
  // 确保初始语言与 localStorage 一致
  const savedLang = localStorage.getItem('lang') || 'en'
  locale.value = savedLang
})

function toggleLanguage() {
  const newLang = currentLang.value === 'en' ? 'zh' : 'en'
  setLanguage(newLang)
  menuOpen.value = false
}

function getUserAvatarLetter(username) {
  if (!username) return '?'
  return username.charAt(0).toUpperCase()
}

async function handleLogout() {
  menuOpen.value = false
  try {
    await authStore.logout()
  } catch (_e) {
    // 服务端失败时 authStore 仍会在 finally 中清本地态
  }
  await router.push({ name: 'home' })
}
</script>

<style scoped>
.lang-switcher {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  list-style: none;
}

.lang-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
  background: rgba(26, 31, 58, 0.8);
  border: 1px solid #233554;
  color: #e6f1ff;
  padding: 0.45rem 0.85rem;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
  font-size: 0.875rem;
  line-height: 1.2;
  min-height: 40px;
  white-space: nowrap;
  touch-action: manipulation;
}

.lang-btn:hover {
  background: rgba(0, 212, 255, 0.1);
  border-color: #00d4ff;
}

.lang-btn:focus-visible {
  outline: none;
  border-color: #00d4ff;
  box-shadow: 0 0 0 2px rgba(0, 212, 255, 0.22);
}

.lang-btn i {
  font-size: 0.95rem;
  flex-shrink: 0;
}

.lang-btn-label {
  font-weight: 500;
}

/* 桌面窄屏：仅图标，节省顶栏空间 */
@media (min-width: 993px) and (max-width: 1180px) {
  .lang-btn {
    padding: 0.45rem 0.55rem;
    min-width: 40px;
  }

  .lang-btn-label {
    display: none;
  }
}

/* 移动端抽屉菜单：与导航项分区，按钮居中 */
@media (max-width: 992px) {
  .lang-switcher {
    width: 100%;
    justify-content: center;
    padding: 0.85rem 1.25rem 0.25rem;
    margin-top: 0.35rem;
    border-top: 1px solid rgba(42, 47, 74, 0.55);
    box-sizing: border-box;
  }

  .lang-btn {
    min-width: 9.5rem;
    max-width: min(300px, 100%);
    min-height: 44px;
    padding: 0.65rem 1.35rem;
    font-size: 0.9375rem;
  }
}

@media (max-width: 480px) {
  .lang-switcher {
    padding-left: 1rem;
    padding-right: 1rem;
  }

  .lang-btn {
    width: 100%;
    max-width: none;
  }
}

/* 产品页顶栏搜索：桌面在「聊天」与工具区之间；移动端为顶栏第二行 */
.nav-products-search-desktop {
  list-style: none;
  display: flex;
  align-items: center;
  flex: 0 1 260px;
  min-width: 120px;
  max-width: 280px;
}

.nav-products-search-wrap {
  width: 100%;
  min-width: 0;
}

.nav-products-search-bar {
  display: none;
}

@media (max-width: 992px) {
  .nav-products-search-desktop {
    display: none;
  }

  .nav-products-search-bar {
    display: block;
  }
}

.nav-products-search {
  position: relative;
  width: 100%;
}

.nav-products-search i {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  color: #8892b0;
  font-size: 13px;
  pointer-events: none;
}

.nav-products-search input {
  width: 100%;
  box-sizing: border-box;
  padding: 0.42rem 0.5rem 0.42rem 2rem;
  font-size: 13px;
  line-height: 1.35;
  border-radius: 6px;
  border: 1px solid #233554;
  background: rgba(26, 31, 58, 0.9);
  color: #e6f1ff;
}

.nav-products-search input:focus {
  outline: none;
  border-color: #00d4ff;
  box-shadow: 0 0 0 2px rgba(0, 212, 255, 0.12);
}

.nav-products-search input::placeholder {
  color: #6b7289;
}

/* 登录用户区：桌面横排，移动端抽屉内卡片式布局 */
.nav-user-inner {
  display: flex;
  align-items: center;
  gap: 0.65rem;
}

.nav-user-profile {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
}

.nav-user-profile .user-name {
  max-width: 7.5rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nav-user-logout {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  flex-shrink: 0;
  padding: 0.4rem 0.75rem;
  min-height: 36px;
  border-radius: 8px;
  border: 1px solid #233554;
  background: rgba(26, 31, 58, 0.55);
  color: #c4c8d4;
  font-size: 0.8125rem;
  line-height: 1.2;
  cursor: pointer;
  touch-action: manipulation;
  transition: border-color 0.2s ease, color 0.2s ease, background 0.2s ease;
}

.nav-user-logout:hover {
  border-color: #00d4ff;
  color: #e6f1ff;
  background: rgba(0, 212, 255, 0.08);
}

.nav-user-logout:focus-visible {
  outline: none;
  border-color: #00d4ff;
  box-shadow: 0 0 0 2px rgba(0, 212, 255, 0.22);
}

@media (min-width: 993px) and (max-width: 1280px) {
  .nav-user-profile .user-name {
    max-width: 5.5rem;
  }

  .nav-user-logout {
    font-size: 0.75rem;
    padding: 0.35rem 0.55rem;
  }
}

@media (max-width: 992px) {
  .nav-user-inner {
    flex-direction: column;
    align-items: stretch;
    gap: 0.75rem;
    width: 100%;
    max-width: min(320px, 100%);
    margin: 0 auto;
  }

  .nav-user-profile {
    justify-content: center;
    gap: 0.65rem;
    padding: 0.15rem 0;
  }

  .nav-user-profile .user-name {
    max-width: min(220px, 70vw);
    font-size: 1rem;
    font-weight: 500;
    color: #e6f1ff;
  }

  .nav-user-logout {
    width: 100%;
    min-height: 44px;
    padding: 0.65rem 1rem;
    font-size: 0.9375rem;
  }
}
</style>