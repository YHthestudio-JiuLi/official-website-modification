<template>
  <div>
    <AppHeader />
    <main>
      <div class="auth-container">
        <div class="auth-card">
          <div class="auth-header">
            <h1><i class="fas fa-user-plus"></i> Register</h1>
            <p>Join YHthestudio and start your tech journey</p>
          </div>

          <div v-if="error" class="alert alert-error">
            <i class="fas fa-exclamation-circle"></i> {{ error }}
          </div>

          <form @submit.prevent="handleRegister" class="auth-form">
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
                :placeholder="$t('auth.register.username')"
              />
            </div>

            <div class="form-group">
              <label for="email">
                <i class="fas fa-envelope"></i> Email
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
                <i class="fas fa-lock"></i> Password
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
              <i class="fas fa-user-plus"></i> {{ loading ? $t('common.loading') : 'Register' }}
            </button>
          </form>

          <div class="auth-footer">
            <p>Already have an account? <router-link to="/login">Login Now</router-link></p>
          </div>
        </div>
      </div>
    </main>
    <AppFooter />
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import AppHeader from '@/components/common/AppHeader.vue'
import AppFooter from '@/components/common/AppFooter.vue'

const router = useRouter()
const { t } = useI18n()
const authStore = useAuthStore()

const form = ref({
  username: '',
  email: '',
  password: ''
})
const error = ref('')
const loading = ref(false)

async function handleRegister() {
  loading.value = true
  error.value = ''

  try {
    await authStore.register(form.value)
    router.push('/')
  } catch (err) {
    error.value = err.response?.data?.message || t('auth.register.error.usernameExists')
  } finally {
    loading.value = false
  }
}
</script>
