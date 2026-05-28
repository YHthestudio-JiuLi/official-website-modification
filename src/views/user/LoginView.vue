<template>
  <div>
    <AppHeader />
    <main>
      <div class="auth-container">
        <div class="auth-card">
          <div class="auth-header">
            <h1><i class="fas fa-sign-in-alt"></i> Login</h1>
            <p>Welcome back to YHthestudio</p>
          </div>

          <div v-if="error" class="alert alert-error">
            <i class="fas fa-exclamation-circle"></i> {{ error }}
          </div>

          <form @submit.prevent="handleLogin" class="auth-form">
            <div class="form-group">
              <label for="username">
                <i class="fas fa-user"></i> Username
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
                <i class="fas fa-lock"></i> Password
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
              <i class="fas fa-sign-in-alt"></i> {{ loading ? $t('common.loading') : 'Login' }}
            </button>
          </form>

          <div class="auth-footer">
            <p>Don't have an account? <router-link :to="registerRoute">Register Now</router-link></p>
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
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { buildRegisterRoute, navigateAfterAuth } from '@/utils/authRedirect'
import AppHeader from '@/components/common/AppHeader.vue'
import AppFooter from '@/components/common/AppFooter.vue'

const router = useRouter()
const route = useRoute()
const { t } = useI18n()
const authStore = useAuthStore()

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
    await navigateAfterAuth(router, route.query.redirect)
  } catch (err) {
    const status = err.response?.status
    if (status === 429) {
      error.value = t('auth.login.error.tooManyRequests')
    } else if (status >= 500) {
      error.value = t('auth.login.error.serverUnavailable')
    } else {
      error.value = err.response?.data?.message || err.response?.data?.error || t('auth.login.error.invalidCredentials')
    }
  } finally {
    loading.value = false
  }
}
</script>
