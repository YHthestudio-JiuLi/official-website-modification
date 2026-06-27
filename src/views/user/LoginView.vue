<template>
  <div>
    <AppHeader />
    <main>
      <div class="auth-container">
        <div class="auth-card">
          <div class="auth-header">
            <h1><i class="fas fa-sign-in-alt"></i> {{ $t('auth.login.title') }}</h1>
            <p>{{ $t('auth.login.subtitle') }}</p>
          </div>

          <div v-if="error" class="alert alert-error">
            <i class="fas fa-exclamation-circle"></i> {{ error }}
          </div>

          <form @submit.prevent="handleLogin" class="auth-form">
            <div class="form-group">
              <label for="username">
                <i class="fas fa-user"></i> {{ $t('auth.login.username') }}
              </label>
              <input
                type="text"
                id="username"
                v-model="form.username"
                required
                autofocus
                :placeholder="$t('auth.login.username')"
              />
            </div>

            <div class="form-group">
              <label for="password">
                <i class="fas fa-lock"></i> {{ $t('auth.login.password') }}
              </label>
              <input
                type="password"
                id="password"
                v-model="form.password"
                required
                :placeholder="$t('auth.login.password')"
              />
            </div>

            <button type="submit" class="btn btn-primary btn-block" :disabled="loading">
              <i class="fas fa-sign-in-alt"></i> {{ loading ? $t('common.loading') : $t('auth.login.submit') }}
            </button>
          </form>

          <div class="auth-footer">
            <p>
              {{ $t('auth.login.noAccount') }}
              <router-link :to="registerRoute">{{ $t('auth.login.registerNow') }}</router-link>
            </p>
          </div>
        </div>
      </div>
    </main>
    <AppFooter />
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { resolveAuthError } from '@/utils/authErrorMessage'
import { useAuthStore } from '@/stores/auth'
import { useAdminStore } from '@/stores/admin'
import { useV2Api } from '@/utils/apiPath'
import { buildRegisterRoute, navigateAfterAuth } from '@/utils/authRedirect'
import AppHeader from '@/components/common/AppHeader.vue'
import AppFooter from '@/components/common/AppFooter.vue'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const adminStore = useAdminStore()

const form = ref({
  username: '',
  password: ''
})
const error = ref('')
const loading = ref(false)

const registerRoute = computed(() =>
  buildRegisterRoute(typeof route.query.redirect === 'string' ? route.query.redirect : null)
)

async function handleLogin() {
  loading.value = true
  error.value = ''

  try {
    await authStore.login(form.value)
    // 前台登录不探测后台会话，避免无权限用户触发 admin/me 401
    if (!useV2Api()) {
      await adminStore.checkAuth()
    }
    await navigateAfterAuth(router, route.query.redirect)
  } catch (err) {
    error.value = resolveAuthError(err, { context: 'login' })
  } finally {
    loading.value = false
  }
}
</script>
