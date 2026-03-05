<template>
  <AdminLayout>
    <template #header-title>{{ isEdit ? 'Edit User' : 'Add User' }}</template>

    <div class="user-form-page">
      <div class="page-header">
        <div class="header-content">
          <h2>
            <i class="fas fa-user"></i>
            {{ isEdit ? 'Edit User' : 'Add User' }}
          </h2>
          <p>{{ isEdit ? 'Update user information and permissions' : 'Create a new user account' }}</p>
        </div>
        <router-link to="/admin/users" class="btn btn-secondary">
          <i class="fas fa-arrow-left"></i> Back to List
        </router-link>
      </div>

      <div v-if="loading" class="loading-container">
        <div class="loading-spinner">
          <i class="fas fa-spinner fa-spin"></i>
          <span>Loading user data...</span>
        </div>
      </div>

      <div v-else class="form-card">
        <form @submit.prevent="handleSubmit" class="form">
          <div v-if="error" class="alert alert-error">
            <i class="fas fa-exclamation-circle"></i> {{ error }}
          </div>
          <div v-if="success" class="alert alert-success">
            <i class="fas fa-check-circle"></i> User saved successfully!
          </div>

          <!-- Basic Information Section -->
          <div class="form-section">
            <h3 class="section-title">
              <i class="fas fa-user-circle"></i> Basic Information
            </h3>

            <div class="form-group">
              <label for="username">
                <i class="fas fa-user"></i> Username
                <span class="required">*</span>
              </label>
              <input
                type="text"
                id="username"
                v-model="form.username"
                :required="!isEdit"
                :disabled="isEdit"
                :class="['form-input', { disabled: isEdit }]"
                placeholder="Enter username"
              />
              <p v-if="isEdit" class="form-hint">
                <i class="fas fa-info-circle"></i> Username cannot be changed after creation
              </p>
            </div>

            <div class="form-group">
              <label for="email">
                <i class="fas fa-envelope"></i> Email Address
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

          <!-- Password Section -->
          <div class="form-section">
            <h3 class="section-title">
              <i class="fas fa-lock"></i> Password {{ isEdit ? '(Optional)' : '*' }}
            </h3>

            <div class="form-group">
              <label for="password">
                <i class="fas fa-key"></i> Password
              </label>
              <div class="password-input-wrapper">
                <input
                  :type="showPassword ? 'text' : 'password'"
                  id="password"
                  v-model="form.password"
                  :required="!isEdit"
                  class="form-input"
                  :placeholder="isEdit ? 'Leave empty to keep current password' : 'Enter password (min 6 characters)'"
                  minlength="6"
                />
                <button
                  type="button"
                  @click="showPassword = !showPassword"
                  class="password-toggle"
                  :title="showPassword ? 'Hide password' : 'Show password'"
                >
                  <i :class="showPassword ? 'fas fa-eye-slash' : 'fas fa-eye'"></i>
                </button>
              </div>
              <p v-if="!isEdit" class="form-hint">
                <i class="fas fa-shield-alt"></i> Password must be at least 6 characters long
              </p>
              <p v-else class="form-hint">
                <i class="fas fa-info-circle"></i> Leave empty to keep the current password
              </p>
            </div>
          </div>

          <!-- Permissions Section -->
          <div class="form-section">
            <h3 class="section-title">
              <i class="fas fa-shield-alt"></i> User Permissions
            </h3>

            <div class="form-group">
              <label class="checkbox-label" :class="{ 'checked': form.isAdmin }">
                <input
                  type="checkbox"
                  v-model="form.isAdmin"
                  class="checkbox-input"
                />
                <span class="checkbox-custom"></span>
                <span class="checkbox-content">
                  <span class="checkbox-title">Administrator Role</span>
                  <span class="checkbox-description">Grant full access to admin panel and all management features</span>
                </span>
                <span class="checkbox-icon">
                  <i class="fas fa-user-shield"></i>
                </span>
              </label>
              <p class="form-hint warning">
                <i class="fas fa-exclamation-triangle"></i>
                Administrators have full control over users, products, orders, and forum content
              </p>
            </div>
          </div>

          <!-- Form Actions -->
          <div class="form-actions">
            <router-link to="/admin/users" class="btn btn-secondary">
              <i class="fas fa-times"></i> Cancel
            </router-link>
            <button type="submit" class="btn btn-primary" :disabled="submitting || !isValid">
              <i :class="submitting ? 'fas fa-spinner fa-spin' : 'fas fa-save'"></i>
              {{ submitting ? 'Saving...' : isEdit ? 'Update User' : 'Create User' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </AdminLayout>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '@/services/api'
import AdminLayout from '@/components/admin/AdminLayout.vue'

const route = useRoute()
const router = useRouter()

const isEdit = computed(() => !!route.params.id)

const form = ref({
  username: '',
  email: '',
  password: '',
  isAdmin: false
})

const showPassword = ref(false)
const loading = ref(false)
const submitting = ref(false)
const error = ref('')
const success = ref(false)

// Form validation
const isValid = computed(() => {
  if (!form.value.username || !form.value.email) return false
  if (!isEdit.value && !form.value.password) return false
  if (form.value.password && form.value.password.length < 6) return false
  // Email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(form.value.email)) return false
  return true
})

// Clear success message when form changes
watch(form, () => {
  success.value = false
  error.value = ''
}, { deep: true })

onMounted(async () => {
  if (isEdit.value) {
    loading.value = true
    try {
      const response = await api.get(`/api/admin/users/${route.params.id}`)
      form.value = {
        username: response.data.username || '',
        email: response.data.email || '',
        password: '',
        isAdmin: !!response.data.isAdmin
      }
    } catch (err) {
      error.value = 'Failed to load user data: ' + (err.response?.data?.message || err.message)
      setTimeout(() => {
        router.push('/admin/users')
      }, 2000)
    } finally {
      loading.value = false
    }
  }
})

async function handleSubmit() {
  if (!isValid.value) {
    error.value = 'Please fill in all required fields correctly'
    return
  }

  submitting.value = true
  error.value = ''
  success.value = false

  try {
    const submitData = { ...form.value }
    // Don't send empty password for edit
    if (isEdit.value && !submitData.password) {
      delete submitData.password
    }

    if (isEdit.value) {
      await api.put(`/api/admin/users/${route.params.id}`, submitData)
      success.value = true
    } else {
      await api.post('/api/admin/users', submitData)
      success.value = true
    }

    // Redirect after short delay
    setTimeout(() => {
      router.push('/admin/users')
    }, 1500)
  } catch (err) {
    error.value = err.response?.data?.message || 'Failed to save user. Please try again.'
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.user-form-page {
  animation: fadeIn 0.5s ease;
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

.alert-success {
  background: rgba(67, 233, 123, 0.15);
  border: 1px solid #43e97b;
  color: #43e97b;
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
  transition: color 0.3s ease;
}

.password-toggle:hover {
  color: var(--primary-color);
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

.form-hint i {
  font-size: 0.85rem;
  margin-top: 0.1rem;
  flex-shrink: 0;
}

.form-hint.warning {
  color: #ffc107;
}

.form-hint.warning i {
  color: #ffc107;
}

/* Custom Checkbox Styling */
.checkbox-label {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem 1.25rem;
  background: rgba(0, 212, 255, 0.05);
  border: 2px solid var(--border-color);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.3s ease;
  position: relative;
}

.checkbox-label:hover {
  background: rgba(0, 212, 255, 0.08);
  border-color: var(--primary-color);
}

.checkbox-label.checked {
  background: rgba(0, 212, 255, 0.1);
  border-color: var(--primary-color);
}

.checkbox-input {
  position: absolute;
  opacity: 0;
  cursor: pointer;
}

.checkbox-custom {
  width: 24px;
  height: 24px;
  min-width: 24px;
  border: 2px solid var(--border-color);
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s ease;
  background: var(--bg-dark);
}

.checkbox-label.checked .checkbox-custom {
  background: var(--primary-color);
  border-color: var(--primary-color);
}

.checkbox-custom::after {
  content: '\f00c';
  font-family: 'Font Awesome 6 Free';
  font-weight: 900;
  color: white;
  font-size: 0.75rem;
  opacity: 0;
  transform: scale(0);
  transition: all 0.2s ease;
}

.checkbox-label.checked .checkbox-custom::after {
  opacity: 1;
  transform: scale(1);
}

.checkbox-content {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.checkbox-title {
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 0.25rem;
}

.checkbox-description {
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.checkbox-icon {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  background: rgba(0, 212, 255, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--primary-color);
  font-size: 1.1rem;
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
  transform: none;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
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

  .page-header {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
