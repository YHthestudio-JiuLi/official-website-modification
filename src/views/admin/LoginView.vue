<template>
  <div class="admin-login-page">
    <div class="admin-login-container">
      <div class="admin-login-card">
        <div class="admin-login-header">
          <i class="fas fa-shield-alt"></i>
          <h1>{{ $t('admin.login.title') }}</h1>
          <p>{{ $t('admin.login.subtitle') }}</p>
        </div>

        <div v-if="error" class="alert alert-error">
          <i class="fas fa-exclamation-circle"></i> {{ error }}
        </div>

        <form @submit.prevent="handleLogin" class="admin-login-form">
          <div class="form-group">
            <label for="username">
              <i class="fas fa-user"></i> {{ $t('admin.login.username') }}
            </label>
            <input
              type="text"
              id="username"
              v-model="form.username"
              required
              autofocus
            />
          </div>
          <div class="form-group">
            <label for="password">
              <i class="fas fa-lock"></i> {{ $t('admin.login.password') }}
            </label>
            <input
              type="password"
              id="password"
              v-model="form.password"
              required
            />
          </div>
          <button type="submit" class="btn btn-primary btn-block" :disabled="loading">
            <i class="fas fa-sign-in-alt"></i> {{ loading ? $t('common.loading') : $t('admin.login.submit') }}
          </button>
        </form>
        <div class="admin-login-footer">
          <p>
            <small>{{ $t('admin.login.defaultAccount') }}</small>
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { resolveAuthError } from '@/utils/authErrorMessage'
import { useI18n } from 'vue-i18n'
import { useAdminStore } from '@/stores/admin'
import { useAdminV2Store } from '@/stores/adminV2'
import { useV2Api } from '@/utils/apiPath'
import { ensureElementPlus } from '@/plugins/elementPlus'
import { isSafeInternalRedirect } from '@/utils/authRedirect'

const router = useRouter()
const route = useRoute()
const { t } = useI18n()
const adminStore = useAdminStore()
const adminV2Store = useAdminV2Store()
const useV2 = useV2Api()

const form = ref({
  username: '',
  password: ''
})
const error = ref('')
const loading = ref(false)

onMounted(() => {
  if (route.query.reauth === '1') {
    error.value = t('admin.login.sessionExpired')
  }
  // 预加载后台 UI 库，减少登录后首屏等待
  ensureElementPlus()
})

async function handleLogin() {
  loading.value = true
  error.value = ''

  try {
    if (useV2) {
      const loginData = await adminV2Store.login(form.value)
      adminStore.admin = loginData.admin || loginData.user
      adminStore.checked = true
    } else {
      await adminStore.login(form.value)
      await adminV2Store.syncLogin(form.value)
    }
    const redirect = route.query.redirect
    const target =
      typeof redirect === 'string' && isSafeInternalRedirect(redirect)
        ? redirect
        : { name: 'admin-dashboard' }
    await router.replace(target)
  } catch (err) {
    error.value = resolveAuthError(err, { context: 'admin' })
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.admin-login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-dark);
}

.admin-login-container {
  width: 100%;
  max-width: 450px;
  padding: 2rem;
}

.admin-login-card {
  background: var(--bg-card);
  padding: 3rem;
  border-radius: 15px;
  border: 1px solid var(--border-color);
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
}

.admin-login-header {
  text-align: center;
  margin-bottom: 2rem;
}

.admin-login-header i {
  font-size: 3rem;
  color: var(--primary-color);
  margin-bottom: 1rem;
  display: block;
}

.admin-login-header h1 {
  margin: 0.5rem 0;
  font-size: 1.8rem;
  background: var(--gradient-3);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.admin-login-header p {
  color: var(--text-secondary);
  margin: 0;
}

.alert {
  padding: 1rem;
  border-radius: 5px;
  margin-bottom: 1.5rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.alert-error {
  background: rgba(247, 37, 133, 0.2);
  border: 1px solid #f72585;
  color: #f72585;
}

.admin-login-form {
  margin-bottom: 1.5rem;
}

.form-group {
  margin-bottom: 1.5rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.5rem;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.form-group input {
  width: 100%;
  padding: 0.8rem;
  background: var(--bg-dark);
  border: 1px solid var(--border-color);
  border-radius: 5px;
  color: var(--text-primary);
  font-size: 1rem;
  transition: all 0.3s ease;
}

.form-group input:focus {
  outline: none;
  border-color: var(--primary-color);
  box-shadow: 0 0 0 3px rgba(0, 212, 255, 0.1);
}

.admin-login-footer {
  text-align: center;
  color: var(--text-secondary);
  font-size: 0.9rem;
}
</style>
