<template>
  <AdminLayout>
    <template #header-title>{{ $t('admin.users.title') }}</template>

    <div class="users-page">
      <div class="page-header">
        <div class="header-content">
          <h2>
            <i class="fas fa-users"></i>
            {{ $t('admin.users.title') }}
          </h2>
          <p>{{ $t('admin.users.description') }}</p>
        </div>
        <div class="header-actions">
          <button @click="router.push('/admin/users/edit')" class="btn btn-primary" :title="$t('admin.users.addUser')">
            <i class="fas fa-plus"></i>
            <span>{{ $t('admin.users.addUser') }}</span>
          </button>
          <button
            v-if="selectedUsers.length > 0"
            @click="confirmBatchDelete"
            class="btn btn-danger"
          >
            <i class="fas fa-trash"></i>
            <span>{{ $t('admin.users.deleteSelected') }}({{ selectedUsers.length }})</span>
            <!-- <span class="count-badge-btn"></span> -->
          </button>
        </div>
      </div>

      <div v-if="loading" class="loading-container">
        <div class="loading-spinner">
          <i class="fas fa-spinner fa-spin"></i>
          <span>{{ $t('admin.users.loadingUsers') }}</span>
        </div>
      </div>

      <div v-else class="table-card">
        <div class="table-header">
          <div class="table-info">
            <i class="fas fa-users"></i>
            <span>{{ $t('admin.users.totalUsers') }} <strong>{{ users.length }}</strong> {{ $t('admin.users.registeredUsers') }}</span>
          </div>
          <div class="table-actions">
            <label class="select-all-label">
              <input type="checkbox" v-model="selectAll" @change="toggleSelectAll" />
              <span>{{ $t('admin.users.selectAll') }}</span>
            </label>
          </div>
        </div>

        <!-- Info Bar -->
        <div class="table-info-bar">
          <p class="info-text">
            <i class="fas fa-info-circle"></i>
            {{ $t('admin.users.infoText') }}
          </p>
        </div>

        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th class="select-column">
                  <input type="checkbox" v-model="selectAll" @change="toggleSelectAll" />
                </th>
                <th>ID</th>
                <th>{{ $t('admin.users.user') }}</th>
                <th>{{ $t('admin.users.email') }}</th>
                <th>{{ $t('admin.users.role') }}</th>
                <th>{{ $t('admin.users.registered') }}</th>
                <th class="text-center">{{ $t('admin.users.actions') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="user in users" :key="user.id" :class="{ 'admin-row': isSuperAdminUser(user), 'selected-row': selectedUsers.includes(user.id) }">
                <td class="select-column">
                  <input type="checkbox" v-model="selectedUsers" :value="user.id" :disabled="isSuperAdminUser(user)" />
                </td>
                <td>
                  <span class="id-badge">#{{ user.id }}</span>
                </td>
                <td>
                  <div class="user-cell">
                    <div class="user-avatar">
                      {{ user.username.charAt(0).toUpperCase() }}
                    </div>
                    <span class="user-name">{{ user.username }}</span>
                  </div>
                </td>
                <td>
                  <span class="email-cell" :title="user.email">{{ user.email }}</span>
                </td>
                <td>
                  <div class="role-tags">
                    <span
                      v-for="name in displayRoles(user)"
                      :key="`${user.id}-${name}`"
                      :class="['role-badge', name === 'super_admin' ? 'role-admin' : 'role-user']"
                    >
                      <i :class="name === 'super_admin' ? 'fas fa-shield-alt' : 'fas fa-user'"></i>
                      {{ roleLabel(name) }}
                    </span>
                  </div>
                </td>
                <td>
                  <span class="date-cell" :title="formatFullDate(user.createdAt)">{{ formatDate(user.createdAt) }}</span>
                </td>
                <td class="actions-cell">
                  <div class="action-group" role="group" :aria-label="`Actions for ${user.username}`">
                    <router-link
                      :to="`/admin/users/edit/${user.id}`"
                      class="action-btn btn-edit"
                      :title="`${$t('admin.users.edit')} ${user.username}`"
                    >
                      <i class="fas fa-edit"></i>
                      <span class="action-text">{{ $t('admin.users.edit') }}</span>
                    </router-link>
                    <button
                      v-if="!isSuperAdminUser(user)"
                      @click="confirmDelete(user.id, user.username)"
                      class="action-btn btn-delete"
                      :title="`${$t('admin.users.delete')} ${user.username}`"
                    >
                      <i class="fas fa-trash"></i>
                      <span class="action-text">{{ $t('admin.users.delete') }}</span>
                    </button>
                    <span
                      v-else
                      class="action-btn btn-protected"
                      :title="`${$t('admin.users.cannotDelete')} ${user.username}`"
                    >
                      <i class="fas fa-lock"></i>
                      <span class="action-text">{{ $t('admin.users.cannotDelete') }}</span>
                    </span>
                  </div>
                </td>
              </tr>
              <tr v-if="users.length === 0">
                <td colspan="6" class="empty-state">
                  <i class="fas fa-user-injured"></i>
                  <h3>{{ $t('admin.users.empty') }}</h3>
                  <p>{{ $t('admin.users.empty') }}</p>
                  <router-link to="/admin/users/edit" class="btn btn-primary">
                    <i class="fas fa-user-plus"></i> {{ $t('admin.users.addUser') }}
                  </router-link>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="scroll-indicator">
          <i class="fas fa-arrows-alt-h"></i>
          <span>Scroll horizontally to see all columns</span>
        </div>
      </div>

      <!-- Delete Confirmation Modal -->
      <div v-if="showDeleteModal" class="modal-overlay" @click="closeDeleteModal">
        <div class="modal-container" @click.stop>
          <div class="modal-header danger">
            <i class="fas fa-exclamation-triangle"></i>
            <h3>{{ $t('admin.users.confirmDelete') }}</h3>
          </div>
          <div class="modal-body">
            <p>{{ $t('admin.users.confirmDelete') }}</p>
            <div class="user-info-box">
              <div class="user-avatar-large">
                {{ userToDelete?.username?.charAt(0).toUpperCase() }}
              </div>
              <div class="user-details">
                <p class="username-text"><strong>{{ userToDelete?.username }}</strong></p>
                <p class="user-email-text">
                  <i class="fas fa-envelope"></i> {{ userToDelete?.email }}
                </p>
                <p class="user-role-text">
                  <span :class="['badge', isSuperAdminUser(userToDelete) ? 'badge-admin' : 'badge-user']">
                    <i :class="isSuperAdminUser(userToDelete) ? 'fas fa-shield-alt' : 'fas fa-user'"></i>
                    {{ isSuperAdminUser(userToDelete) ? $t('admin.users.admin') : $t('admin.users.userRole') }}
                  </span>
                </p>
              </div>
            </div>
            <div class="warning-box">
              <i class="fas fa-exclamation-circle"></i>
              <div class="warning-content">
                <p><strong>{{ $t('admin.users.actionCannotUndo') }}</strong></p>
                <ul>
                  <li>{{ $t('admin.users.batchDeleteWarning1') }}</li>
                  <li>{{ $t('admin.users.batchDeleteWarning2') }}</li>
                  <li>{{ $t('admin.users.batchDeleteWarning3') }}</li>
                </ul>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button @click="closeDeleteModal" class="btn btn-secondary">
              <i class="fas fa-times"></i> {{ $t('admin.users.keepUser') }}
            </button>
            <button @click="executeDelete" class="btn btn-danger">
              <i class="fas fa-trash"></i> {{ $t('admin.users.delete') }}
            </button>
          </div>
        </div>
      </div>

      <!-- Batch Delete Confirmation Modal -->
      <div v-if="showBatchDeleteModal" class="modal-overlay" @click="closeBatchDeleteModal">
        <div class="modal-container" @click.stop>
          <div class="modal-header danger">
            <i class="fas fa-exclamation-triangle"></i>
            <h3>{{ $t('admin.users.confirmBatchDeletion') }}</h3>
          </div>
          <div class="modal-body">
            <p>{{ $t('admin.users.batchDeleteWarning', { count: selectedUsers.length }) }}</p>
            <div class="warning-box">
              <i class="fas fa-exclamation-circle"></i>
              <div class="warning-content">
                <p><strong>{{ $t('admin.users.actionCannotUndo') }}</strong></p>
                <ul>
                  <li>{{ $t('admin.users.batchDeleteWarning1') }}</li>
                  <li>{{ $t('admin.users.batchDeleteWarning2') }}</li>
                  <li>{{ $t('admin.users.batchDeleteWarning3') }}</li>
                </ul>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button @click="closeBatchDeleteModal" class="btn btn-secondary">
              <i class="fas fa-times"></i> {{ $t('admin.users.cancel') }}
            </button>
            <button @click="executeBatchDelete" class="btn btn-danger">
              <i class="fas fa-trash"></i> {{ $t('admin.users.deleteUsers', { count: selectedUsers.length }) }}
            </button>
          </div>
        </div>
      </div>

      <!-- Toast Notification -->
      <div v-if="toast.visible" :class="['toast', toast.type]">
        <i :class="toast.type === 'success' ? 'fas fa-check-circle' : 'fas fa-exclamation-circle'"></i>
        <span>{{ toast.message }}</span>
      </div>
    </div>
  </AdminLayout>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { fetchUsers as fetchUsersApi, deleteUser } from '@/services/v2/admin/users'
import AdminLayout from '@/components/admin/AdminLayout.vue'

const { t, locale, te } = useI18n()
const router = useRouter()

function roleLabel(name) {
  const key = `admin.rbac.roleNames.${name}`
  return te(key) ? t(key) : name
}

/** 以 Spatie 角色为准；无角色数据时回退 legacy isAdmin */
function isSuperAdminUser(user) {
  if (Array.isArray(user?.roles)) {
    return user.roles.includes('super_admin')
  }
  return !!user?.isAdmin
}

function displayRoles(user) {
  if (Array.isArray(user?.roles) && user.roles.length > 0) {
    return user.roles
  }
  return isSuperAdminUser(user) ? ['super_admin'] : ['customer']
}

const users = ref([])
const loading = ref(true)
const selectAll = ref(false)
const selectedUsers = ref([])

// Delete modal state
const showDeleteModal = ref(false)
const userToDelete = ref(null)

// Batch delete modal state
const showBatchDeleteModal = ref(false)

// Toast notification state
const toast = ref({
  visible: false,
  type: 'success',
  message: ''
})

onMounted(fetchUsers)

async function fetchUsers() {
  loading.value = true
  try {
    const response = await fetchUsersApi()
    const payload = response.data
    users.value = Array.isArray(payload) ? payload : (payload?.data ?? [])
  } catch (error) {
    showToast(t('admin.users.failedToDelete'), 'error')
  } finally {
    loading.value = false
  }
}

function confirmDelete(id, username) {
  userToDelete.value = users.value.find(u => u.id === id)
  showDeleteModal.value = true
}

function closeDeleteModal() {
  showDeleteModal.value = false
  userToDelete.value = null
}

async function executeDelete() {
  if (!userToDelete.value) return

  const userId = userToDelete.value.id
  const username = userToDelete.value.username

  try {
    await deleteUser(userId)
    closeDeleteModal()
    await fetchUsers()
    showToast(`${username} deleted successfully`, 'success')
  } catch (error) {
    showToast(t('admin.users.failedToDelete') + ': ' + (error.response?.data?.message || t('common.error')), 'error')
  }
}

function showToast(message, type = 'success') {
  toast.value = { visible: true, type, message }
  setTimeout(() => {
    toast.value.visible = false
  }, 4000)
}

function formatDate(dateStr) {
  if (!dateStr) return '-'
  const fmtLocale = locale.value === 'zh' ? 'zh-CN' : 'en-US'
  return new Date(dateStr).toLocaleDateString(fmtLocale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })
}

function formatFullDate(dateStr) {
  if (!dateStr) return '-'
  const fmtLocale = locale.value === 'zh' ? 'zh-CN' : 'en-US'
  return new Date(dateStr).toLocaleString(fmtLocale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })
}

// Watch for changes in selectedUsers to update selectAll
watch(selectedUsers, (newVal) => {
  const nonAdminUsers = users.value.filter(u => !isSuperAdminUser(u)).map(u => u.id)
  selectAll.value = newVal.length > 0 && nonAdminUsers.every(id => newVal.includes(id))
}, { deep: true })

function toggleSelectAll() {
  if (selectAll.value) {
    // Select all non-admin users
    selectedUsers.value = users.value.filter(u => !isSuperAdminUser(u)).map(u => u.id)
  } else {
    // Deselect all
    selectedUsers.value = []
  }
}

function confirmBatchDelete() {
  if (selectedUsers.value.length === 0) return
  showBatchDeleteModal.value = true
}

function closeBatchDeleteModal() {
  showBatchDeleteModal.value = false
}

async function executeBatchDelete() {
  const selectedIds = [...selectedUsers.value]
  if (selectedIds.length === 0) return

  try {
    // Delete users one by one
    const deletePromises = selectedIds.map((id) => deleteUser(id))
    await Promise.all(deletePromises)

    closeBatchDeleteModal()
    selectedUsers.value = []
    await fetchUsers()
    showToast(t('admin.users.successfullyDeleted', { count: selectedIds.length }), 'success')
  } catch (error) {
    showToast(t('admin.users.failedToDelete') + ': ' + (error.response?.data?.message || t('common.error')), 'error')
  }
}
</script>

<style scoped>
.users-page {
  animation: fadeIn 0.5s ease;
  position: relative;
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

.header-actions {
  display: flex;
  align-items: center;
  gap: 1rem;
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

.header-actions .btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0 1.2rem;
  height: 40px;
  min-width: 120px;
  font-size: 0.9rem;
  font-weight: 500;
  line-height: 1;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  text-decoration: none;
  transition: all 0.3s ease;
  box-sizing: border-box;
}

.btn-primary {
  background: var(--gradient-3);
  color: white;
}

.btn-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 5px 20px rgba(0, 212, 255, 0.3);
}

.btn-secondary {
  background: rgba(154, 157, 180, 0.15);
  color: var(--text-secondary);
}

.btn-secondary:hover {
  background: rgba(154, 157, 180, 0.25);
  color: var(--text-primary);
}

.btn-danger {
  background: linear-gradient(135deg, #f5576c, #e0455a);
  color: white;
}

.btn-danger:hover {
  transform: translateY(-2px);
  box-shadow: 0 5px 20px rgba(245, 87, 108, 0.3);
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
}

.loading-spinner i {
  font-size: 2rem;
  color: var(--primary-color);
}

.table-card {
  background: var(--bg-card);
  border-radius: 12px;
  border: 1px solid var(--border-color);
  overflow: visible;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
}

.table-header {
  padding: 1rem 1.5rem;
  border-bottom: 1px solid var(--border-color);
  background: rgba(0, 212, 255, 0.03);
}

.table-info {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--text-secondary);
  font-size: 0.9rem;
}

.table-info i {
  color: var(--primary-color);
}

.table-info strong {
  color: var(--primary-color);
}

.table-info-bar {
  padding: 0.75rem 1.5rem;
  background: rgba(0, 212, 255, 0.05);
  border-bottom: 1px solid var(--border-color);
}

.info-text {
  margin: 0;
  font-size: 0.85rem;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.info-text i {
  color: var(--primary-color);
}

.table-responsive {
  overflow-x: auto !important;
  overflow-y: hidden !important;
  -webkit-overflow-scrolling: touch;
  max-width: 100%;
  display: block;
  width: 100%;
}

.table-responsive::-webkit-scrollbar {
  height: 8px;
}

.table-responsive::-webkit-scrollbar-track {
  background: var(--bg-darker);
  border-radius: 4px;
}

.table-responsive::-webkit-scrollbar-thumb {
  background: var(--primary-color);
  border-radius: 4px;
}

.table-responsive::-webkit-scrollbar-thumb:hover {
  background: #00b8e6;
}

.data-table {
  width: 100%;
  min-width: 1000px;
  border-collapse: collapse;
  display: table;
}

.scroll-indicator {
  display: none;
  padding: 0.5rem 1rem;
  background: var(--bg-darker);
  border-top: 1px solid var(--border-color);
  font-size: 0.75rem;
  color: var(--text-secondary);
  text-align: center;
  gap: 0.5rem;
  align-items: center;
  justify-content: center;
}

.scroll-indicator i {
  font-size: 0.8rem;
}

@media (max-width: 1200px) {
  .scroll-indicator {
    display: flex;
  }
}

@media (max-width: 768px) {
  .table-card {
    border-radius: 8px;
  }
  
  .table-responsive {
    border-radius: 8px;
  }
}

.data-table thead {
  background: var(--bg-darker);
}

.data-table th {
  padding: 1rem 1.5rem;
  text-align: left;
  font-weight: 600;
  color: var(--text-primary);
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.data-table th.text-center {
  text-align: center;
}

.data-table td {
  padding: 1rem 1.5rem;
  border-bottom: 1px solid var(--border-color);
  color: var(--text-secondary);
  vertical-align: middle;
}

.data-table tbody tr:hover {
  background: rgba(0, 212, 255, 0.05);
}

.data-table tbody tr.admin-row {
  background: rgba(0, 212, 255, 0.08);
}

.id-badge {
  display: inline-block;
  padding: 0.25rem 0.6rem;
  background: rgba(0, 212, 255, 0.1);
  color: var(--primary-color);
  border-radius: 4px;
  font-weight: 600;
  font-size: 0.85rem;
}

.user-cell {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.user-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--gradient-3);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: 600;
  font-size: 1rem;
}

.user-name {
  color: var(--text-primary);
  font-weight: 500;
}

.email-cell {
  font-family: monospace;
  font-size: 0.9rem;
  max-width: 200px;
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
}

.role-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.35rem 0.75rem;
  border-radius: 6px;
  font-size: 0.8rem;
  font-weight: 500;
}

.role-badge.role-admin {
  background: rgba(0, 212, 255, 0.15);
  color: var(--primary-color);
}

.role-badge.role-user {
  background: rgba(154, 157, 180, 0.15);
  color: var(--text-secondary);
}

.role-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.date-cell {
  font-size: 0.9rem;
  white-space: nowrap;
}

.actions-cell {
  text-align: center;
}

.action-group {
  display: inline-flex;
  gap: 0.5rem;
  justify-content: center;
  align-items: center;
}

.action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  min-width: 80px;
  height: 40px;
  padding: 0 1rem;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  transition: all 0.3s ease;
  text-decoration: none;
  font-size: 0.9rem;
  font-weight: 500;
}

.action-btn i {
  font-size: 1rem;
  flex-shrink: 0;
}

.action-text {
  display: none;
  white-space: nowrap;
  line-height: 1;
}

@media (min-width: 1200px) {
  .action-text {
    display: inline;
  }
}

.btn-edit {
  background: rgba(0, 212, 255, 0.15);
  color: var(--primary-color);
}

.btn-edit:hover {
  background: var(--primary-color);
  color: white;
}

.btn-delete {
  background: rgba(245, 87, 108, 0.15);
  color: #f5576c;
}

.btn-delete:hover {
  background: #f5576c;
  color: white;
}

.btn-protected {
  background: rgba(154, 157, 180, 0.1);
  color: var(--text-secondary);
  cursor: default;
}

.empty-state {
  text-align: center;
  padding: 4rem !important;
  color: var(--text-secondary);
}

.empty-state i {
  font-size: 4rem;
  margin-bottom: 1rem;
  opacity: 0.5;
}

.empty-state h3 {
  margin: 1rem 0 0.5rem;
  color: var(--text-primary);
}

.empty-state p {
  margin: 0 0 1.5rem;
}

/* Modal Styles */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  animation: fadeIn 0.3s ease;
}

.modal-container {
  background: var(--bg-card);
  border-radius: 12px;
  border: 1px solid var(--border-color);
  max-width: 550px;
  width: 90%;
  max-height: 90vh;
  overflow-y: auto;
  animation: slideUp 0.3s ease;
}

.modal-header {
  padding: 1.5rem;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.modal-header.danger i {
  color: #ffc107;
  font-size: 1.5rem;
}

.modal-header h3 {
  margin: 0;
  font-size: 1.2rem;
  color: var(--text-primary);
}

.modal-body {
  padding: 1.5rem;
}

.modal-body p {
  margin: 0 0 1rem 0;
  color: var(--text-secondary);
}

.user-info-box {
  display: flex;
  gap: 1rem;
  padding: 1rem;
  background: rgba(0, 212, 255, 0.05);
  border: 1px solid var(--primary-color);
  border-radius: 8px;
  margin: 1rem 0;
}

.user-avatar-large {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: var(--gradient-3);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: 700;
  font-size: 1.5rem;
  flex-shrink: 0;
}

.user-details {
  flex: 1;
}

.username-text {
  margin: 0 0 0.5rem 0;
  color: var(--text-primary);
  font-size: 1.1rem;
}

.user-email-text {
  margin: 0 0 0.5rem 0;
  color: var(--text-secondary);
  font-size: 0.9rem;
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.user-email-text i {
  font-size: 0.85rem;
}

.user-role-text {
  margin: 0;
}

.user-role-text .badge {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.35rem 0.75rem;
  border-radius: 6px;
  font-size: 0.8rem;
  font-weight: 500;
}

.badge.badge-admin {
  background: rgba(0, 212, 255, 0.15);
  color: var(--primary-color);
}

.badge.badge-user {
  background: rgba(154, 157, 180, 0.15);
  color: var(--text-secondary);
}

.warning-box {
  display: flex;
  gap: 0.75rem;
  padding: 1rem;
  background: rgba(245, 87, 108, 0.1);
  border: 1px solid #f5576c;
  border-radius: 8px;
  color: #f5576c;
}

.warning-box i {
  font-size: 1.2rem;
  flex-shrink: 0;
}

.warning-content {
  flex: 1;
}

.warning-content p {
  margin: 0 0 0.5rem 0;
  color: #f5576c;
}

.warning-content ul {
  margin: 0.5rem 0 0 0;
  padding-left: 1.25rem;
}

.warning-content li {
  color: #f5576c;
  margin-bottom: 0.25rem;
}

.modal-footer {
  padding: 1rem 1.5rem;
  border-top: 1px solid var(--border-color);
  display: flex;
  gap: 1rem;
  justify-content: flex-end;
}

/* Toast Notification */
.toast {
  position: fixed;
  bottom: 2rem;
  right: 2rem;
  padding: 1rem 1.5rem;
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  animation: slideInRight 0.3s ease;
  z-index: 1001;
  box-shadow: 0 5px 20px rgba(0, 0, 0, 0.3);
}

.toast.success {
  background: rgba(67, 233, 123, 0.15);
  border: 1px solid #43e97b;
  color: #43e97b;
}

.toast.error {
  background: rgba(245, 87, 108, 0.15);
  border: 1px solid #f5576c;
  color: #f5576c;
}

.toast i {
  font-size: 1.2rem;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes slideInRight {
  from {
    opacity: 0;
    transform: translateX(100px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@media (max-width: 768px) {
  .users-page {
    width: 100%;
    max-width: 100%;
  }

  .page-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .btn {
    width: 100%;
    justify-content: center;
  }

  .user-info-box {
    flex-direction: column;
    align-items: center;
    text-align: center;
  }

  .toast {
    left: 1rem;
    right: 1rem;
    bottom: 1rem;
  }

  .modal-footer {
    flex-direction: column;
  }

  .modal-footer .btn {
    width: 100%;
    justify-content: center;
  }

  .table-card {
    border-radius: 8px;
  }
}

@media (max-width: 576px) {
  .admin-content {
    padding: 0.5rem;
  }

  .data-table {
    min-width: 900px;
  }
}
</style>
