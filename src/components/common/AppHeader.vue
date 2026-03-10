<template>
  <header class="navbar">
    <div class="container">
      <router-link to="/" class="nav-brand">
        <i class="fas fa-cube"></i>
        <span>YHthestudio</span>
      </router-link>

      <ul class="nav-menu" :class="{ active: menuOpen }">
        <li><router-link to="/" class="nav-link">{{ $t('nav.home') }}</router-link></li>
        <li><router-link to="/products" class="nav-link">{{ $t('nav.products') }}</router-link></li>
        <li><router-link to="/forum" class="nav-link">{{ $t('nav.forum') }}</router-link></li>
        <li>
          <router-link to="/cart" class="nav-link cart-link">
            <i class="fas fa-shopping-cart"></i>
            <span class="cart-count" v-if="cartStore.itemCount > 0">{{ cartStore.itemCount }}</span>
          </router-link>
        </li>

        <!-- 语言切换 -->
        <li class="lang-switcher">
          <button @click="toggleLanguage" class="nav-link lang-btn" :title="$t('language.switch')">
            <i class="fas fa-globe"></i>
            <span>{{ currentLang === 'zh' ? '中文' : 'EN' }}</span>
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
          <li><router-link to="/login" class="nav-link">{{ $t('nav.login') }}</router-link></li>
          <li>
            <router-link to="/register" class="nav-link btn-primary">
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
    </div>
  </header>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { useCartStore } from '@/stores/cart'
import { setLanguage } from '@/i18n'

const authStore = useAuthStore()
const cartStore = useCartStore()
const { locale } = useI18n()
const menuOpen = ref(false)

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
  await authStore.logout()
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
</style>