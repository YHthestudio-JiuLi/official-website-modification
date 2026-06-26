<template>
  <div class="popup-notices-view">
      <div class="page-header">
        <div>
          <h1 class="page-title">{{ $t('admin.popupNotices.title') }}</h1>
          <p class="page-subtitle">{{ $t('admin.popupNotices.subtitle') }}</p>
        </div>
        <button v-if="canManage" class="btn btn-primary" @click="showCreateForm">
          <i class="fas fa-plus"></i> {{ $t('admin.popupNotices.addNew') }}
        </button>
      </div>

      <AdminNoPermissionCard v-if="!canAccessPage" message-key="admin.popupNotices.noPermission" />

      <div v-else-if="loading" class="loading-state">
        <i class="fas fa-spinner fa-spin"></i>
        <span>{{ $t('common.loading') }}</span>
      </div>

      <div v-else-if="error" class="error-state">
        <i class="fas fa-exclamation-circle"></i>
        <span>{{ error }}</span>
      </div>

      <div v-else-if="notices.length === 0" class="empty-state">
        <i class="fas fa-inbox"></i>
        <p>{{ $t('admin.popupNotices.empty') }}</p>
        <button v-if="canManage" class="btn btn-primary" @click="showCreateForm">
          {{ $t('admin.popupNotices.createFirst') }}
        </button>
      </div>

      <div v-else class="notices-grid">
        <div v-for="notice in notices" :key="notice.id" class="notice-card" :class="{ active: notice.enabled }">
          <div class="notice-card-header">
            <h3 class="notice-card-title">{{ notice.title }}</h3>
            <span class="status-badge" :class="{ 'status-active': notice.enabled, 'status-inactive': !notice.enabled }">
              {{ notice.enabled ? $t('admin.popupNotices.active') : $t('admin.popupNotices.inactive') }}
            </span>
          </div>
          <div class="notice-card-content">
            <p>{{ truncateContent(notice.content) }}</p>
          </div>
          <div class="notice-card-footer">
            <span class="notice-date">
              <i class="fas fa-clock"></i> {{ formatDate(notice.updated_at) }}
            </span>
            <div v-if="canManage" class="notice-actions">
              <button class="btn-icon" @click.stop="toggleStatus(notice)" :title="$t('admin.popupNotices.toggleVisibility') || 'Toggle visibility'">
                <i :class="notice.enabled ? 'fas fa-eye' : 'fas fa-eye-slash'"></i>
              </button>
              <button class="btn-icon" @click.stop="editNotice(notice)" :title="$t('common.edit')">
                <i class="fas fa-edit"></i>
              </button>
              <button class="btn-icon btn-danger" @click.stop="deleteNotice(notice)" :title="$t('common.delete')">
                <i class="fas fa-trash"></i>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Edit/Create Form Modal -->
      <div v-if="showModal" class="form-page-overlay">
        <div class="form-page-card">
          <div class="form-page-header">
            <div class="header-content">
              <h2>
                <i class="fas" :class="isEditing ? 'fas fa-edit' : 'fas fa-plus-circle'"></i>
                {{ isEditing ? $t('admin.popupNotices.edit') : $t('admin.popupNotices.create') }}
              </h2>
              <p>{{ isEditing ? $t('admin.popupNotices.editDesc') : $t('admin.popupNotices.createDesc') }}</p>
            </div>
            <button type="button" class="btn btn-secondary" @click="closeModal">
              <i class="fas fa-times"></i> {{ $t('common.cancel') }}
            </button>
          </div>

          <div class="form-card">
            <form @submit.prevent="saveNotice" class="form">
              <div class="form-section">
                <h3 class="section-title">
                  <i class="fas fa-file-alt"></i> {{ $t('admin.popupNotices.noticeContent') }}
                </h3>

                <div class="form-group">
                  <label for="title">
                    <i class="fas fa-heading"></i> {{ $t('admin.popupNotices.title') }}
                    <span class="required">*</span>
                  </label>
                  <input
                    type="text"
                    id="title"
                    v-model="form.title"
                    class="form-input"
                    :placeholder="$t('admin.popupNotices.titlePlaceholder')"
                    required
                  />
                </div>

                <div class="form-group">
                  <label for="content">
                    <i class="fas fa-align-left"></i> {{ $t('admin.popupNotices.content') || 'Content' }}
                    <span class="required">*</span>
                  </label>
                  <textarea
                    id="content"
                    v-model="form.content"
                    class="form-input form-textarea"
                    :placeholder="$t('admin.popupNotices.contentPlaceholder')"
                    rows="8"
                    required
                  ></textarea>
                  <p class="form-hint">
                    <i class="fas fa-info-circle"></i> {{ $t('admin.popupNotices.contentHint') || 'Use line breaks to format your message' }}
                  </p>
                </div>
              </div>

              <div class="form-section">
                <h3 class="section-title">
                  <i class="fas fa-toggle-on"></i> {{ $t('admin.popupNotices.settings') }}
                </h3>

                <div class="form-group form-checkbox-group">
                  <label class="checkbox-label">
                    <div class="checkbox-box">
                      <input type="checkbox" v-model="form.enabled" />
                      <i class="fas fa-check checkbox-icon"></i>
                    </div>
                    <span>{{ $t('admin.popupNotices.enabled') }}</span>
                  </label>
                  <p class="form-hint">
                    <i class="fas fa-info-circle"></i> {{ $t('admin.popupNotices.enabledHint') || 'Only one enabled notice will be shown on homepage' }}
                  </p>
                </div>
              </div>

              <div class="form-actions">
                <button type="button" class="btn btn-secondary" @click="closeModal">
                  {{ $t('common.cancel') }}
                </button>
                <button type="submit" class="btn btn-primary" :disabled="saving">
                  <i v-if="saving" class="fas fa-spinner fa-spin"></i>
                  {{ saving ? $t('common.saving') || 'Saving...' : $t('common.save') }}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  fetchNotices as fetchNoticesApi,
  createNotice,
  updateNotice,
  deleteNotice as deleteNoticeApi
} from '@/services/v2/admin/popupNotices'
import { handleAdminApiFailure } from '@/utils/adminApiError'
import { useAdminPermissions } from '@/composables/useAdminPermission'
import AdminNoPermissionCard from '@/components/admin/AdminNoPermissionCard.vue'

const { has } = useAdminPermissions()
const canView = computed(() => has('content.view') || has('content.manage'))
const canManage = computed(() => has('content.manage'))
const canAccessPage = computed(() => canView.value)

const { t } = useI18n()

const notices = ref([])
const loading = ref(true)
const error = ref('')
const showModal = ref(false)
const isEditing = ref(false)
const saving = ref(false)

const form = ref({
  id: null,
  title: '',
  content: '',
  enabled: true
})

function isNoticeEnabled(value) {
  return value === true || value === 1 || value === '1' || value === 'true'
}

async function fetchNotices() {
  if (!canAccessPage.value) {
    loading.value = false
    return
  }
  loading.value = true
  error.value = ''
  try {
    const res = await fetchNoticesApi()
    notices.value = (res.data.notices || []).map((n) => ({
      ...n,
      enabled: isNoticeEnabled(n.enabled)
    }))
  } catch (err) {
    if (await handleAdminApiFailure(err)) return
    error.value = err.response?.data?.error || 'Failed to load notices'
  } finally {
    loading.value = false
  }
}

function showCreateForm() {
  form.value = { id: null, title: '', content: '', enabled: true }
  isEditing.value = false
  showModal.value = true
}

function editNotice(notice) {
  form.value = {
    id: notice.id,
    title: notice.title,
    content: notice.content,
    enabled: isNoticeEnabled(notice.enabled)
  }
  isEditing.value = true
  showModal.value = true
}

function closeModal() {
  showModal.value = false
}

async function saveNotice() {
  if (!form.value.title.trim() || !form.value.content.trim()) {
    return
  }
  saving.value = true
  try {
    if (isEditing.value) {
      await updateNotice(form.value.id, form.value)
    } else {
      await createNotice(form.value)
    }
    closeModal()
    await fetchNotices()
  } catch (err) {
    alert(err.response?.data?.error || 'Failed to save')
  } finally {
    saving.value = false
  }
}

async function toggleStatus(notice) {
  try {
    await updateNotice(notice.id, {
      title: notice.title,
      content: notice.content,
      enabled: !isNoticeEnabled(notice.enabled)
    })
    await fetchNotices()
  } catch (err) {
    alert(err.response?.data?.error || 'Failed to update status')
  }
}

async function deleteNotice(notice) {
  try {
    await deleteNoticeApi(notice.id)
    notices.value = notices.value.filter((n) => n.id !== notice.id)
    await fetchNotices()
  } catch (err) {
    alert(err.response?.data?.error || 'Failed to delete')
  }
}

function truncateContent(content) {
  if (!content) return ''
  return content.length > 150 ? content.substring(0, 150) + '...' : content
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

onMounted(() => {
  fetchNotices()
})
</script>

<style scoped>
.popup-notices-view {
  padding: 1.5rem;
  max-width: 1200px;
  margin: 0 auto;
  height: calc(100vh - 140px);
  overflow-y: auto;
}

.popup-notices-view::-webkit-scrollbar {
  width: 8px;
}

.popup-notices-view::-webkit-scrollbar-track {
  background: var(--bg-dark);
}

.popup-notices-view::-webkit-scrollbar-thumb {
  background: #2a2f4a;
  border-radius: 4px;
}

.popup-notices-view::-webkit-scrollbar-thumb:hover {
  background: #3a3f5a;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
}

.page-title {
  font-size: 1.75rem;
  font-weight: 700;
  color: #1f2937;
  margin: 0;
}

.page-subtitle {
  color: #6b7280;
  margin: 0.25rem 0 0 0;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 1.25rem;
  border-radius: 8px;
  font-size: 0.95rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
}

.btn-primary {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.btn-secondary {
  background: #f3f4f6;
  color: #374151;
}

.loading-state,
.error-state,
.empty-state {
  text-align: center;
  padding: 4rem 2rem;
  color: #6b7280;
}

.loading-state i {
  font-size: 2rem;
  margin-right: 0.5rem;
  color: #667eea;
}

.error-state i {
  font-size: 2rem;
  margin-right: 0.5rem;
  color: #ef4444;
}

.empty-state i {
  font-size: 3rem;
  margin-bottom: 1rem;
  color: #d1d5db;
}

.empty-state p {
  margin-bottom: 1.5rem;
}

.notices-grid {
  display: grid;
  gap: 1.5rem;
}

.notice-card {
  background: var(--bg-card);
  border-radius: 12px;
  border: 1px solid var(--border-color);
  overflow: hidden;
  transition: all 0.3s ease;
}

.notice-card:hover {
  box-shadow: 0 4px 16px rgba(0, 212, 255, 0.15);
  border-color: rgba(0, 212, 255, 0.4);
  transform: translateY(-2px);
}

.notice-card.active {
  border-color: var(--primary-color);
  box-shadow: 0 2px 12px rgba(0, 212, 255, 0.25);
  background: linear-gradient(135deg, rgba(0, 212, 255, 0.08) 0%, var(--bg-card) 100%);
}

.notice-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.25rem;
  background: rgba(10, 14, 39, 0.3);
  border-bottom: 1px solid var(--border-color);
}

.notice-card-title {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.status-badge {
  padding: 0.25rem 0.75rem;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 500;
}

.status-active {
  background: rgba(0, 212, 255, 0.15);
  color: var(--primary-color);
  border: 1px solid rgba(0, 212, 255, 0.3);
}

.status-inactive {
  background: rgba(107, 114, 128, 0.15);
  color: var(--text-secondary);
  border: 1px solid rgba(107, 114, 128, 0.3);
}

.notice-card-content {
  padding: 1.25rem;
}

.notice-card-content p {
  margin: 0;
  color: var(--text-secondary);
  line-height: 1.6;
}

.notice-card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.25rem;
  border-top: 1px solid var(--border-color);
  background: rgba(10, 14, 39, 0.2);
}

.notice-date {
  font-size: 0.875rem;
  color: var(--text-secondary);
}

.notice-actions {
  display: flex;
  gap: 0.5rem;
}

.btn-icon {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.btn-icon:hover {
  background: rgba(0, 212, 255, 0.15);
  color: var(--primary-color);
  border-color: rgba(0, 212, 255, 0.3);
}

.btn-icon.btn-danger:hover {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
  border-color: rgba(239, 68, 68, 0.3);
}

/* Form Page Overlay (Edit/Create) */
.form-page-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(5, 8, 16, 0.8);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 2rem;
}

.form-page-card {
  background: var(--bg-card);
  border-radius: 12px;
  width: 100%;
  max-width: 700px;
  max-height: 90vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  border: 1px solid var(--border-color);
}

.form-page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.5rem 2rem;
  border-bottom: 1px solid var(--border-color);
  background: rgba(10, 14, 39, 0.3);
}

.form-page-header h2 {
  margin: 0;
  font-size: 1.5rem;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.form-page-header p {
  margin: 0.25rem 0 0 0;
  color: var(--text-secondary);
  font-size: 0.95rem;
}

.header-content {
  flex: 1;
}

/* Form Card */
.form-card {
  flex: 1;
  overflow-y: auto;
  padding: 2rem;
}

.form-card::-webkit-scrollbar {
  width: 8px;
}

.form-card::-webkit-scrollbar-track {
  background: var(--bg-dark);
}

.form-card::-webkit-scrollbar-thumb {
  background: #2a2f4a;
  border-radius: 4px;
  transition: background 0.3s ease;
}

.form-card::-webkit-scrollbar-thumb:hover {
  background: #3a3f5a;
}

.form {
  max-width: 100%;
}

.form-section {
  margin-bottom: 2rem;
  padding-bottom: 2rem;
  border-bottom: 1px solid var(--border-color);
}

.form-section:last-of-type {
  margin-bottom: 0;
  padding-bottom: 0;
  border-bottom: none;
}

.section-title {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 1.5rem 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.section-title i {
  color: var(--primary-color);
}

.form-group {
  margin-bottom: 1.5rem;
}

.form-group label {
  display: block;
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 0.5rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.form-group label i {
  color: var(--primary-color);
  width: 16px;
}

.form-group label .required {
  color: #ef4444;
  margin-left: 0.25rem;
}

.form-input {
  width: 100%;
  padding: 0.75rem 1rem;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  font-size: 1rem;
  font-family: inherit;
  transition: all 0.2s;
  background: var(--bg-dark);
  color: var(--text-primary);
}

.form-input:focus {
  outline: none;
  border-color: var(--primary-color);
  box-shadow: 0 0 0 3px rgba(0, 212, 255, 0.15);
}

.form-textarea {
  resize: vertical;
  min-height: 150px;
  line-height: 1.6;
}

.form-hint {
  margin: 0.5rem 0 0 0;
  font-size: 0.875rem;
  color: var(--text-secondary);
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
}

.form-hint i {
  color: var(--text-secondary);
  margin-top: 0.125rem;
}

.form-checkbox-group {
  margin-bottom: 0;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 1rem;
  cursor: pointer;
  font-weight: 500;
  color: var(--text-primary);
  padding: 1rem 1.25rem;
  border-radius: 8px;
  transition: all 0.2s ease;
  border: 1px solid var(--border-color);
  background: rgba(10, 14, 39, 0.3);
}

.checkbox-label:hover {
  background: rgba(0, 212, 255, 0.1);
  border-color: rgba(0, 212, 255, 0.4);
}

.checkbox-box {
  position: relative;
  width: 24px;
  height: 24px;
  flex-shrink: 0;
}

.checkbox-box input[type="checkbox"] {
  position: absolute;
  opacity: 0;
  width: 100%;
  height: 100%;
  cursor: pointer;
  margin: 0;
  z-index: 2;
}

.checkbox-box::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 24px;
  height: 24px;
  border: 2px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-dark);
  transition: all 0.2s ease;
}

.checkbox-box .checkbox-icon {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%) scale(0);
  font-size: 14px;
  color: white;
  transition: all 0.2s ease;
  z-index: 1;
}

.checkbox-box input[type="checkbox"]:checked + .checkbox-icon {
  transform: translate(-50%, -50%) scale(1);
}

.checkbox-box:has(input[type="checkbox"]:checked)::before {
  background: var(--primary-color);
  border-color: var(--primary-color);
  box-shadow: 0 0 12px rgba(0, 212, 255, 0.4);
}

.checkbox-label:has(input[type="checkbox"]:checked) {
  background: rgba(0, 212, 255, 0.12);
  border-color: var(--primary-color);
}

.checkbox-label:has(input[type="checkbox"]:checked) span {
  color: var(--text-primary);
  font-weight: 600;
}

.checkbox-label span {
  font-size: 1rem;
  color: var(--text-secondary);
  transition: color 0.2s ease;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  margin-top: 2rem;
  padding-top: 1.5rem;
  border-top: 1px solid var(--border-color);
}

.form-actions .btn {
  min-width: 120px;
  justify-content: center;
}

@media (max-width: 640px) {
  .popup-notices-view {
    padding: 1rem;
  }
  
  .page-header {
    flex-direction: column;
    gap: 1rem;
    align-items: flex-start;
  }
  
  .form-page-overlay {
    padding: 1rem;
  }
  
  .form-page-header {
    padding: 1rem;
    flex-direction: column;
    gap: 1rem;
    align-items: flex-start;
  }
  
  .form-page-header h2 {
    font-size: 1.25rem;
  }
  
  .form-card {
    padding: 1rem;
  }
  
  .form-actions {
    flex-direction: column;
  }
  
  .form-actions .btn {
    width: 100%;
  }
}
</style>
