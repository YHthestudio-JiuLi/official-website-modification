<template>
  <div class="user-form-page">
      <div class="page-header">
        <div class="header-content">
          <h2>
            <i class="fas fa-user"></i>
            {{ isEdit ? $t('admin.users.editUser') : $t('admin.users.addUser') }}
          </h2>
          <p>{{ isEdit ? $t('admin.users.formEditDesc') : $t('admin.users.formAddDesc') }}</p>
        </div>
        <router-link to="/admin/users" class="btn btn-secondary">
          <i class="fas fa-arrow-left"></i> {{ $t('admin.users.backToList') }}
        </router-link>
      </div>

      <div v-if="loading" class="loading-container">
        <div class="loading-spinner">
          <i class="fas fa-spinner fa-spin"></i>
          <span>{{ $t('admin.users.loadingUser') }}</span>
        </div>
      </div>

      <div v-else class="form-card">
        <form @submit.prevent="handleSubmit" class="form">
          <div v-if="error" class="alert alert-error">
            <i class="fas fa-exclamation-circle"></i> {{ error }}
          </div>

          <div class="form-section">
            <h3 class="section-title">
              <i class="fas fa-user-circle"></i> {{ $t('admin.users.basicInfo') }}
            </h3>

            <div class="form-group">
              <label for="username">
                <i class="fas fa-user"></i> {{ $t('admin.users.username') }}
                <span class="required">*</span>
              </label>
              <input
                type="text"
                id="username"
                v-model="form.username"
                :required="!isEdit"
                :disabled="isEdit"
                :class="['form-input', { disabled: isEdit }]"
                :placeholder="$t('admin.users.usernamePlaceholder')"
              />
              <p v-if="isEdit" class="form-hint">
                <i class="fas fa-info-circle"></i> {{ $t('admin.users.usernameLocked') }}
              </p>
            </div>

            <div class="form-group">
              <label for="email">
                <i class="fas fa-envelope"></i> {{ $t('admin.users.email') }}
                <span class="required">*</span>
              </label>
              <input
                type="email"
                id="email"
                v-model="form.email"
                required
                class="form-input"
                placeholder="user@example.com"
              />
            </div>
          </div>

          <div class="form-section">
            <h3 class="section-title">
              <i class="fas fa-lock"></i>
              {{ isEdit ? $t('admin.users.passwordOptional') : $t('admin.users.password') }}
            </h3>

            <div class="form-group">
              <label for="password">
                <i class="fas fa-key"></i> {{ $t('admin.users.password') }}
              </label>
              <div class="password-input-wrapper">
                <input
                  :type="showPassword ? 'text' : 'password'"
                  id="password"
                  v-model="form.password"
                  :required="!isEdit"
                  class="form-input"
                  :placeholder="isEdit ? $t('admin.users.passwordKeepHint') : $t('admin.users.passwordPlaceholder')"
                  minlength="8"
                />
                <button
                  type="button"
                  @click="showPassword = !showPassword"
                  class="password-toggle"
                >
                  <i :class="showPassword ? 'fas fa-eye-slash' : 'fas fa-eye'"></i>
                </button>
              </div>
              <p class="form-hint">
                <i class="fas fa-shield-alt"></i> {{ $t('admin.users.passwordMinHint') }}
              </p>
            </div>
          </div>

          <div class="form-section">
            <h3 class="section-title">
              <i class="fas fa-shield-alt"></i> {{ $t('admin.users.permissionsSection') }}
            </h3>

            <div class="form-group">
              <label for="roles">
                <i class="fas fa-user-tag"></i> {{ $t('admin.users.assignRoles') }}
              </label>
              <select
                id="roles"
                v-model="form.roles"
                class="form-input roles-select"
                multiple
                size="5"
              >
                <option
                  v-for="role in availableRoles"
                  :key="role.name"
                  :value="role.name"
                >
                  {{ roleLabel(role.name) }}
                </option>
              </select>
              <p class="form-hint">
                <i class="fas fa-info-circle"></i> {{ $t('admin.users.rolesHint') }}
              </p>
            </div>

            <div class="selected-roles" v-if="form.roles.length">
              <span
                v-for="name in form.roles"
                :key="name"
                :class="['role-chip', name === 'super_admin' ? 'role-chip-admin' : '']"
              >
                {{ roleLabel(name) }}
              </span>
            </div>
          </div>

          <div class="form-actions">
            <router-link to="/admin/users" class="btn btn-secondary">
              <i class="fas fa-times"></i> {{ $t('admin.users.cancel') }}
            </router-link>
            <button type="submit" class="btn btn-primary" :disabled="submitting || !isValid">
              <i :class="submitting ? 'fas fa-spinner fa-spin' : 'fas fa-save'"></i>
              {{ submitting ? $t('admin.users.saving') : (isEdit ? $t('admin.users.updateUser') : $t('admin.users.createUser')) }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <div v-if="toast.visible" :class="['toast', toast.type]">
      <i :class="toast.type === 'success' ? 'fas fa-check-circle' : 'fas fa-exclamation-circle'"></i>
      <span>{{ toast.message }}</span>
    </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { readAdminApiError } from '@/utils/adminApiError'
import { fetchUser, createUser, updateUser } from '@/services/v2/admin/users'
import { fetchRoles } from '@/services/v2/admin/roles'

const route = useRoute()
const router = useRouter()
const { t, te } = useI18n()

const isEdit = computed(() => !!route.params.id)

const form = ref({
  username: '',
  email: '',
  password: '',
  roles: ['customer'],
})

const availableRoles = ref([])
const showPassword = ref(false)
const loading = ref(false)
const submitting = ref(false)
const error = ref('')

const toast = ref({
  visible: false,
  type: 'success',
  message: '',
})

function roleLabel(name) {
  const key = `admin.rbac.roleNames.${name}`
  return te(key) ? t(key) : name
}

function normalizeRoles(rawRoles, isAdmin) {
  if (Array.isArray(rawRoles) && rawRoles.length > 0) {
    return [...new Set(rawRoles)]
  }
  return isAdmin ? ['super_admin'] : ['customer']
}

const isValid = computed(() => {
  if (!form.value.username || !form.value.email) return false
  if (!isEdit.value && !form.value.password) return false
  if (form.value.password && form.value.password.length < 8) return false
  if (!form.value.roles.length) return false
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(form.value.email)
})

watch(form, () => {
  error.value = ''
}, { deep: true })

onMounted(async () => {
  loading.value = true
  try {
    const rolesPromise = fetchRoles()
    const userPromise = isEdit.value ? fetchUser(route.params.id) : Promise.resolve(null)
    const [rolesRes, userRes] = await Promise.all([rolesPromise, userPromise])

    availableRoles.value = Array.isArray(rolesRes.data) ? rolesRes.data : []
    if (!availableRoles.value.length) {
      availableRoles.value = [
        { name: 'super_admin' },
        { name: 'staff' },
        { name: 'agent' },
        { name: 'customer' },
      ]
    }

    if (isEdit.value && userRes) {
      const data = userRes.data || {}
      form.value = {
        username: data.username || '',
        email: data.email || '',
        password: '',
        roles: normalizeRoles(data.roles, !!data.isAdmin),
      }
    }
  } catch (err) {
    error.value = t('admin.users.loadFailed', {
      message: err.response?.data?.message || err.message,
    })
    setTimeout(() => router.push('/admin/users'), 2000)
  } finally {
    loading.value = false
  }
})

async function handleSubmit() {
  if (!isValid.value) {
    error.value = t('admin.users.formInvalid')
    return
  }

  submitting.value = true
  error.value = ''

  try {
    const payload = {
      email: form.value.email.trim(),
      roles: [...form.value.roles],
      isAdmin: form.value.roles.includes('super_admin'),
    }
    if (!isEdit.value) {
      payload.username = form.value.username.trim()
    }
    if (form.value.password?.trim()) {
      payload.password = form.value.password
    }

    if (isEdit.value) {
      await updateUser(route.params.id, payload)
    } else {
      await createUser(payload)
    }

    showToast(t('admin.users.saveSuccess'), 'success')
    setTimeout(() => router.push('/admin/users'), 1200)
  } catch (err) {
    error.value = readAdminApiError(err, t('admin.users.saveFailed'))
  } finally {
    submitting.value = false
  }
}

function showToast(message, type = 'success') {
  toast.value = { visible: true, type, message }
  setTimeout(() => {
    toast.value.visible = false
  }, 4000)
}
</script>

<style scoped>
.user-form-page {
  animation: fadeIn 0.12s ease;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
  flex-wrap: wrap;
  gap: 1rem;
}

.header-content h2 {
  margin: 0 0 0.25rem 0;
  font-size: 1.5rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--text-primary);
}

.header-content p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.95rem;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.25rem;
  border-radius: 8px;
  font-weight: 500;
  text-decoration: none;
  transition: all 0.3s ease;
  border: none;
  cursor: pointer;
}

.btn-secondary {
  background: rgba(154, 157, 180, 0.15);
  color: var(--text-secondary);
}

.btn-secondary:hover {
  background: rgba(154, 157, 180, 0.25);
  color: var(--text-primary);
}

.loading-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 300px;
}

.loading-spinner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  color: var(--text-secondary);
}

.loading-spinner i {
  font-size: 2rem;
  color: var(--primary-color);
}

.form-card {
  background: var(--bg-card);
  border-radius: 12px;
  border: 1px solid var(--border-color);
  overflow: hidden;
}

.form {
  padding: 2rem;
}

.alert {
  padding: 1rem 1.25rem;
  border-radius: 8px;
  margin-bottom: 1.5rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.alert-error {
  background: rgba(245, 87, 108, 0.15);
  border: 1px solid #f5576c;
  color: #f5576c;
}

.form-section {
  margin-bottom: 2rem;
  padding-bottom: 2rem;
  border-bottom: 1px solid var(--border-color);
}

.form-section:last-of-type {
  border-bottom: none;
  margin-bottom: 0;
  padding-bottom: 0;
}

.section-title {
  font-size: 1.1rem;
  margin: 0 0 1.25rem 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--text-primary);
}

.section-title i {
  color: var(--primary-color);
}

.form-group {
  margin-bottom: 1.25rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.5rem;
  color: var(--text-primary);
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.95rem;
}

.form-group label i {
  color: var(--primary-color);
  font-size: 0.9rem;
}

.required {
  color: #f5576c;
  margin-left: 0.25rem;
}

.form-input {
  width: 100%;
  padding: 0.875rem 1rem;
  background: var(--bg-dark);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  color: var(--text-primary);
  font-size: 0.95rem;
  transition: all 0.3s ease;
}

.roles-select option {
  padding: 0.5rem;
}

.form-input:focus {
  outline: none;
  border-color: var(--primary-color);
  box-shadow: 0 0 0 3px rgba(0, 212, 255, 0.1);
}

.form-input.disabled {
  background: rgba(154, 157, 180, 0.1);
  cursor: not-allowed;
  color: var(--text-secondary);
}

.password-input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.password-input-wrapper .form-input {
  flex: 1;
  padding-right: 3rem;
}

.password-toggle {
  position: absolute;
  right: 0.75rem;
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 0.5rem;
}

.form-hint {
  margin-top: 0.5rem;
  font-size: 0.85rem;
  color: var(--text-secondary);
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  line-height: 1.4;
}

.selected-roles {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.role-chip {
  display: inline-flex;
  align-items: center;
  padding: 0.35rem 0.75rem;
  border-radius: 999px;
  font-size: 0.85rem;
  background: rgba(154, 157, 180, 0.15);
  color: var(--text-secondary);
}

.role-chip-admin {
  background: rgba(0, 212, 255, 0.15);
  color: var(--primary-color);
}

.form-actions {
  display: flex;
  gap: 1rem;
  justify-content: flex-end;
  padding-top: 1.5rem;
  border-top: 1px solid var(--border-color);
}

.btn-primary {
  background: var(--gradient-3);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 5px 20px rgba(0, 212, 255, 0.3);
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.toast {
  position: fixed;
  bottom: 2rem;
  right: 2rem;
  padding: 1rem 1.5rem;
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  z-index: 2000;
  box-shadow: 0 5px 20px rgba(0, 0, 0, 0.3);
}

.toast.success {
  background: rgba(67, 233, 123, 0.15);
  border: 1px solid #43e97b;
  color: #43e97b;
}

@media (max-width: 768px) {
  .form {
    padding: 1.5rem;
  }

  .form-actions {
    flex-direction: column;
  }

  .btn {
    width: 100%;
    justify-content: center;
  }
}
</style>
