<template>
  <div>
    <AppHeader />
    <main>
      <div class="auth-container">
        <div class="auth-card">
          <div class="auth-header">
            <h1><i class="fas fa-user-plus"></i> {{ $t('auth.register.title') }}</h1>
            <p>{{ $t('auth.register.subtitle') }}</p>
          </div>

          <div v-if="error" class="alert alert-error">
            <i class="fas fa-exclamation-circle"></i> {{ error }}
          </div>

          <form @submit.prevent="handleRegister" class="auth-form">
            <div class="form-group">
              <label for="username">
                <i class="fas fa-user"></i> {{ $t('auth.register.username') }}
              </label>
              <input
                type="text"
                id="username"
                v-model="form.username"
                required
                autofocus
                :placeholder="$t('auth.register.username')"
              />
            </div>

            <div class="form-group">
              <label for="email">
                <i class="fas fa-envelope"></i> {{ $t('auth.register.email') }}
              </label>
              <input
                type="email"
                id="email"
                v-model="form.email"
                required
                :placeholder="$t('auth.register.email')"
              />
            </div>

            <div class="form-group">
              <label for="password">
                <i class="fas fa-lock"></i> {{ $t('auth.register.password') }}
              </label>
              <input
                type="password"
                id="password"
                v-model="form.password"
                required
                minlength="6"
                :placeholder="$t('auth.register.password')"
              />
            </div>

            <button type="submit" class="btn btn-primary btn-block" :disabled="loading">
              <i class="fas fa-user-plus"></i>
              {{ loading ? $t('common.loading') : $t('auth.register.submit') }}
            </button>
          </form>

          <div class="auth-footer">
            <p>
              {{ $t('auth.register.hasAccount') }}
              <router-link :to="loginRoute">{{ $t('auth.register.loginNow') }}</router-link>
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
import { buildLoginRoute, navigateAfterAuth } from '@/utils/authRedirect'
import { resolveAuthError } from '@/utils/authErrorMessage'
import { useAuthStore } from '@/stores/auth'
import AppHeader from '@/components/common/AppHeader.vue'
import AppFooter from '@/components/common/AppFooter.vue'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

const form = ref({
  username: '',
  email: '',
  password: ''
})
const error = ref('')
const loading = ref(false)

const loginRoute = computed(() =>
  buildLoginRoute(typeof route.query.redirect === 'string' ? route.query.redirect : null)
)

async function handleRegister() {
  loading.value = true
  error.value = ''

  try {
    await authStore.register(form.value)
    await navigateAfterAuth(router, route.query.redirect)
  } catch (err) {
    error.value = resolveAuthError(err, { context: 'register' })
  } finally {
    loading.value = false
  }
}
</script>
