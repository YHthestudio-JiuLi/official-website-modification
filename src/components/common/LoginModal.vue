<template>
  <Teleport to="body">
    <div
      v-if="modelValue"
      class="login-modal-overlay"
      role="dialog"
      aria-modal="true"
      @click.self="close"
    >
      <div class="login-modal-card">
        <button type="button" class="login-modal-close" :aria-label="$t('common.close')" @click="close">
          <i class="fas fa-times"></i>
        </button>

        <div class="login-modal-header">
          <h2><i class="fas fa-sign-in-alt"></i> {{ $t('auth.login.title') }}</h2>
          <p>{{ subtitle || $t('chat.hub.loginModalDesc') }}</p>
        </div>

        <div v-if="error" class="alert alert-error">
          <i class="fas fa-exclamation-circle"></i> {{ error }}
        </div>

        <form class="login-modal-form" @submit.prevent="handleLogin">
          <div class="form-group">
            <label for="login-modal-username">
              <i class="fas fa-user"></i> {{ $t('auth.login.username') }}
            </label>
            <input
              id="login-modal-username"
              v-model="form.username"
              type="text"
              required
              autocomplete="username"
              :placeholder="$t('auth.login.username')"
            />
          </div>
          <div class="form-group">
            <label for="login-modal-password">
              <i class="fas fa-lock"></i> {{ $t('auth.login.password') }}
            </label>
            <input
              id="login-modal-password"
              v-model="form.password"
              type="password"
              required
              autocomplete="current-password"
              :placeholder="$t('auth.login.password')"
            />
          </div>
          <button type="submit" class="btn btn-primary btn-block" :disabled="loading">
            <i class="fas fa-sign-in-alt"></i>
            {{ loading ? $t('common.loading') : $t('auth.login.submit') }}
          </button>
        </form>

        <p class="login-modal-footer">
          {{ $t('auth.login.noAccount') }}
          <router-link :to="registerRoute" @click="goRegister">
            {{ $t('auth.login.registerNow') }}
          </router-link>
        </p>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, watch, computed } from 'vue'
import { useRoute } from 'vue-router'
import { resolveAuthError } from '@/utils/authErrorMessage'
import { useAuthStore } from '@/stores/auth'
import { buildRegisterRoute } from '@/utils/authRedirect'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  subtitle: { type: String, default: '' },
})

const emit = defineEmits(['update:modelValue', 'success'])

const CHAT_AUTO_START_KEY = 'chat_auto_start'

const route = useRoute()
const authStore = useAuthStore()

const registerRoute = computed(() => {
  const redirect =
    typeof route.query.redirect === 'string'
      ? route.query.redirect
      : route.fullPath.startsWith('/chat')
        ? '/chat'
        : null
  return buildRegisterRoute(redirect)
})

const form = ref({ username: '', password: '' })
const error = ref('')
const loading = ref(false)

function close() {
  emit('update:modelValue', false)
}

function goRegister() {
  sessionStorage.setItem(CHAT_AUTO_START_KEY, '1')
  close()
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      error.value = ''
      form.value = { username: '', password: '' }
    }
  }
)

async function handleLogin() {
  loading.value = true
  error.value = ''
  try {
    await authStore.login(form.value)
    emit('success')
    emit('update:modelValue', false)
  } catch (err) {
    error.value = resolveAuthError(err, { context: 'login' })
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
  background: rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(4px);
}

.login-modal-card {
  position: relative;
  width: 100%;
  max-width: 420px;
  padding: 2rem;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.45);
}

.login-modal-close {
  position: absolute;
  top: 1rem;
  right: 1rem;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition: background 0.2s, color 0.2s;
}

.login-modal-close:hover {
  background: rgba(0, 212, 255, 0.1);
  color: var(--primary-color);
}

.login-modal-header {
  text-align: center;
  margin-bottom: 1.5rem;
}

.login-modal-header h2 {
  color: var(--text-primary);
  font-size: 1.35rem;
  margin: 0 0 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
}

.login-modal-header h2 i {
  color: var(--primary-color);
}

.login-modal-header p {
  color: var(--text-secondary);
  font-size: 0.9rem;
  margin: 0;
  line-height: 1.5;
}

.login-modal-form .form-group {
  margin-bottom: 1rem;
}

.login-modal-form label {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  color: var(--text-secondary);
  font-size: 0.875rem;
  margin-bottom: 0.375rem;
}

.login-modal-form label i {
  color: var(--primary-color);
}

.login-modal-form input {
  width: 100%;
  padding: 0.75rem 1rem;
  background: var(--bg-dark);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  color: var(--text-primary);
  font-size: 1rem;
}

.login-modal-form input:focus {
  outline: none;
  border-color: var(--primary-color);
}

.alert-error {
  padding: 0.75rem 1rem;
  margin-bottom: 1rem;
  border-radius: 8px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #ef4444;
  font-size: 0.875rem;
}

.login-modal-footer {
  margin: 1.25rem 0 0;
  text-align: center;
  color: var(--text-secondary);
  font-size: 0.875rem;
}

.login-modal-footer a {
  color: var(--primary-color);
  text-decoration: none;
  margin-left: 0.25rem;
}

.login-modal-footer a:hover {
  text-decoration: underline;
}
</style>
