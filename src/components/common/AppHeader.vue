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
          <button @click="toggleLanguage" class="nav-link lang-btn" :title="$t('language.switch')">
            <i class="fas fa-globe"></i>
            <span>{{ currentLang === 'zh' ? $t('language.zh') : $t('language.en') }}</span>
          </button>
        </li>

        <template v-if="authStore.isLoggedIn">
          <li>
            <router-link to="/orders" class="nav-link">
              <i class="fas fa-list"></i> {{ $t('nav.myOrders') }}
            </router-link>
          </li>
          <li class="nav-user">
            <div class="user-avatar-display">
              <span class="avatar-letter">{{ getUserAvatarLetter(authStore.username) }}</span>
            </div>
            <span class="user-name">
              {{ authStore.username }}
            </span>
            <a href="#" @click.prevent="handleLogout" class="nav-link logout">
              {{ $t('nav.logout') }}
            </a>
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
}

function getUserAvatarLetter(username) {
  if (!username) return '?'
  return username.charAt(0).toUpperCase()
}

async function handleLogout() {
  try {
    await authStore.logout()
  } catch (_e) {
    // 服务端 419/网络失败时 authStore 仍会在 finally 中清本地态
  }
  window.location.href = '/'
}
</script>

<style scoped>
.lang-switcher {
  display: flex;
  align-items: center;
}

.lang-btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: rgba(26, 31, 58, 0.8);
  border: 1px solid #233554;
  color: #e6f1ff;
  padding: 0.5rem 1rem;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.3s;
  font-size: 14px;
}

.lang-btn:hover {
  background: rgba(0, 212, 255, 0.1);
  border-color: #00d4ff;
}

.lang-btn i {
  font-size: 16px;
}

@media (max-width: 768px) {
  .lang-switcher {
    margin-top: 1rem;
  }
  
  .lang-btn {
    width: 100%;
    justify-content: center;
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
</style>