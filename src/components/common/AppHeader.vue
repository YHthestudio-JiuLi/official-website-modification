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

        <template v-if="authStore.isLoggedIn">
          <li>
            <router-link to="/orders" class="nav-link">
              <i class="fas fa-shopping-cart"></i> {{ $t('nav.myOrders') }}
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
import { ref } from 'vue'
import { useAuthStore } from '@/stores/auth'

const authStore = useAuthStore()
const menuOpen = ref(false)

function getUserAvatarLetter(username) {
  if (!username) return '?'
  return username.charAt(0).toUpperCase()
}

async function handleLogout() {
  await authStore.logout()
  window.location.href = '/'
}
</script>