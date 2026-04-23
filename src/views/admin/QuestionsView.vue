<template>
  <AdminLayout>
    <template #header-title>{{ $t('admin.questions.pageTitle') }}</template>

    <div class="questions-page">
      <div class="page-header">
        <div class="header-content">
          <h2>
            <i class="fas fa-database"></i>
            {{ $t('admin.questions.listTitle') }}
          </h2>
          <p>{{ $t('admin.questions.description') }}</p>
        </div>
        <router-link to="/admin/questions/add" class="btn btn-primary">
          <i class="fas fa-plus"></i>
          <span>{{ $t('admin.questions.add') }}</span>
        </router-link>
      </div>

      <div v-if="loading" class="loading-container">
        <div class="loading-spinner">
          <i class="fas fa-spinner fa-spin"></i>
          <span>{{ $t('admin.questions.loading') }}</span>
        </div>
      </div>

      <div v-else class="table-card">
        <div class="table-header">
          <div class="table-info">
            <i class="fas fa-database"></i>
            <span>{{ $t('admin.questions.count', { filtered: filteredQuestions.length, total: questions.length }) }}</span>
          </div>
          <div class="table-filter">
            <label for="categoryFilter">{{ $t('admin.questions.category') }}</label>
            <select id="categoryFilter" v-model="categoryFilter" class="filter-select">
              <option value="">{{ $t('admin.questions.filterAll') }}</option>
              <option value="__uncategorized__">{{ $t('admin.questions.filterUncategorized') }}</option>
              <option v-for="item in categoryOptions" :key="item" :value="item">{{ item }}</option>
            </select>
          </div>
        </div>

        <div class="table-info-bar">
          <p class="info-text">
            <i class="fas fa-info-circle"></i>
            {{ $t('admin.questions.tableHint') }}
          </p>
        </div>

        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>{{ $t('admin.questions.colName') }}</th>
                <th>{{ $t('admin.questions.colCategory') }}</th>
                <th>{{ $t('admin.questions.colDbFile') }}</th>
                <th>{{ $t('admin.questions.colIndexFile') }}</th>
                <th>{{ $t('admin.questions.colCreatedAt') }}</th>
                <th class="text-center">{{ $t('admin.questions.colActions') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="question in filteredQuestions" :key="question.id">
                <td>
                  <span class="id-badge">#{{ question.id }}</span>
                </td>
                <td>
                  <span class="question-name">{{ question.name }}</span>
                </td>
                <td>
                  <span v-if="question.category_name" class="category-badge">{{ question.category_name }}</span>
                  <span v-else class="empty-cell">{{ $t('admin.questions.uncategorized') }}</span>
                </td>
                <td>
                  <span v-if="question.db_file_path" class="file-cell">
                    <i class="fas fa-file-alt"></i>
                    {{ getFileName(question.db_file_path) }}
                  </span>
                  <span v-else class="empty-cell">-</span>
                </td>
                <td>
                  <span v-if="question.vector_file_path" class="file-cell">
                    <i class="fas fa-file-archive"></i>
                    {{ getFileName(question.vector_file_path) }}
                  </span>
                  <span v-else class="empty-cell">-</span>
                </td>
                <td>
                  <span class="date-cell">{{ formatDate(question.created_at) }}</span>
                </td>
                <td class="actions-cell">
                  <div class="action-group">
                    <router-link
                      :to="`/admin/questions/edit/${question.id}`"
                      class="action-btn btn-edit"
                      :title="$t('admin.questions.editTitle')"
                    >
                      <i class="fas fa-edit"></i>
                      <span class="action-text">{{ $t('common.edit') }}</span>
                    </router-link>
                    <button
                      @click="confirmDelete(question)"
                      class="action-btn btn-delete"
                      :title="$t('admin.questions.deleteTitle')"
                    >
                      <i class="fas fa-trash"></i>
                      <span class="action-text">{{ $t('common.delete') }}</span>
                    </button>
                  </div>
                </td>
              </tr>
              <tr v-if="filteredQuestions.length === 0">
                <td colspan="7" class="empty-state">
                  <i class="fas fa-database"></i>
                  <h3>{{ questions.length === 0 ? $t('admin.questions.emptyAllTitle') : $t('admin.questions.emptyFilterTitle') }}</h3>
                  <p>{{ questions.length === 0 ? $t('admin.questions.emptyAllDesc') : $t('admin.questions.emptyFilterDesc') }}</p>
                  <router-link to="/admin/questions/add" class="btn btn-primary">
                    <i class="fas fa-plus"></i> {{ $t('admin.questions.add') }}
                  </router-link>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div v-if="showDeleteModal" class="modal-overlay" @click="closeDeleteModal">
        <div class="modal-container" @click.stop>
          <div class="modal-header danger">
            <i class="fas fa-exclamation-triangle"></i>
            <h3>{{ $t('admin.questions.deleteModalTitle') }}</h3>
          </div>
          <div class="modal-body">
            <p>{{ $t('admin.questions.deleteModalText') }}</p>
            <div class="question-info-box">
              <div class="question-details">
                <p class="question-name-text"><strong>{{ questionToDelete?.name }}</strong></p>
                <p class="question-meta">ID: {{ questionToDelete?.id }}</p>
              </div>
            </div>
            <div class="warning-box">
              <i class="fas fa-exclamation-circle"></i>
              <div class="warning-content">
                <p><strong>{{ $t('admin.questions.deleteCannotUndo') }}</strong></p>
                <p>{{ $t('admin.questions.deleteWarningFiles') }}</p>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button @click="closeDeleteModal" class="btn btn-secondary">
              <i class="fas fa-times"></i> {{ $t('common.cancel') }}
            </button>
            <button @click="executeDelete" class="btn btn-danger">
              <i class="fas fa-trash"></i> {{ $t('admin.questions.deleteConfirm') }}
            </button>
          </div>
        </div>
      </div>

      <div v-if="toast.visible" :class="['toast', toast.type]">
        <i :class="toast.type === 'success' ? 'fas fa-check-circle' : 'fas fa-exclamation-circle'"></i>
        <span>{{ toast.message }}</span>
      </div>
    </div>
  </AdminLayout>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import api from '@/services/api'
import AdminLayout from '@/components/admin/AdminLayout.vue'

const { t, locale } = useI18n()

const questions = ref([])
const loading = ref(true)
const showDeleteModal = ref(false)
const questionToDelete = ref(null)
const categoryFilter = ref('')

const toast = ref({
  visible: false,
  type: 'success',
  message: ''
})

onMounted(fetchQuestions)

const categoryOptions = computed(() => {
  const values = [...new Set(questions.value.map(item => String(item.category_name || '').trim()).filter(Boolean))]
  const collatorLocale = locale.value === 'zh' ? 'zh-CN' : 'en-US'
  return values.sort((a, b) => a.localeCompare(b, collatorLocale))
})

const filteredQuestions = computed(() => {
  if (!categoryFilter.value) return questions.value
  if (categoryFilter.value === '__uncategorized__') {
    return questions.value.filter(item => !String(item.category_name || '').trim())
  }
  return questions.value.filter(item => String(item.category_name || '').trim() === categoryFilter.value)
})

async function fetchQuestions() {
  loading.value = true
  try {
    const response = await api.get('/api/admin/questions')
    questions.value = response.data
  } catch (error) {
    showToast(t('admin.questions.loadError'), 'error')
  } finally {
    loading.value = false
  }
}

function confirmDelete(question) {
  questionToDelete.value = question
  showDeleteModal.value = true
}

function closeDeleteModal() {
  showDeleteModal.value = false
  questionToDelete.value = null
}

async function executeDelete() {
  if (!questionToDelete.value) return

  try {
    await api.delete(`/api/admin/questions/${questionToDelete.value.id}`)
    closeDeleteModal()
    await fetchQuestions()
    showToast(t('admin.questions.deleteSuccess', { name: questionToDelete.value.name }), 'success')
  } catch (error) {
    showToast(
      t('admin.questions.deleteError', {
        message: error.response?.data?.message || t('common.unknownError')
      }),
      'error'
    )
  }
}

function showToast(message, type = 'success') {
  toast.value = { visible: true, type, message }
  setTimeout(() => {
    toast.value.visible = false
  }, 4000)
}

function getFileName(filePath) {
  if (!filePath) return '-'
  return filePath.split('/').pop() || filePath
}

function formatDate(dateStr) {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  const fmtLocale = locale.value === 'zh' ? 'zh-CN' : 'en-US'
  return date.toLocaleString(fmtLocale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}
</script>

<style scoped>
.questions-page {
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
  background: #f5576c;
  color: white;
}

.btn-danger:hover {
  background: #e0455a;
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
}

.table-header {
  padding: 1rem 1.5rem;
  border-bottom: 1px solid var(--border-color);
  background: rgba(0, 212, 255, 0.03);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
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

.table-filter {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.table-filter label {
  color: var(--text-secondary);
  font-size: 0.85rem;
}

.filter-select {
  min-width: 160px;
  padding: 0.45rem 0.75rem;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  background: var(--bg-dark);
  color: var(--text-primary);
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

.table-responsive {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.data-table {
  width: 100%;
  min-width: 800px;
  border-collapse: collapse;
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

.id-badge {
  display: inline-block;
  padding: 0.25rem 0.6rem;
  background: rgba(0, 212, 255, 0.1);
  color: var(--primary-color);
  border-radius: 4px;
  font-weight: 600;
  font-size: 0.85rem;
}

.question-name {
  color: var(--text-primary);
  font-weight: 500;
}

.category-badge {
  display: inline-flex;
  align-items: center;
  padding: 0.2rem 0.6rem;
  border-radius: 999px;
  background: rgba(100, 108, 255, 0.15);
  color: #8f96ff;
  font-size: 0.8rem;
}

.file-cell {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--text-primary);
}

.file-cell i {
  color: var(--primary-color);
}

.empty-cell {
  color: var(--text-secondary);
  opacity: 0.5;
}

.date-cell {
  color: var(--text-secondary);
  font-size: 0.9rem;
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
}

.action-text {
  display: inline;
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

.question-info-box {
  padding: 1rem;
  background: rgba(0, 212, 255, 0.05);
  border-radius: 8px;
  border-left: 3px solid var(--primary-color);
  margin: 1rem 0;
}

.question-details {
  flex: 1;
}

.question-name-text {
  margin: 0 0 0.5rem 0;
  color: var(--text-primary);
}

.question-meta {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.85rem;
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

.warning-content p {
  margin: 0;
  color: #f5576c;
}

.warning-content p:first-child {
  margin-bottom: 0.25rem;
}

.modal-footer {
  padding: 1rem 1.5rem;
  border-top: 1px solid var(--border-color);
  display: flex;
  gap: 1rem;
  justify-content: flex-end;
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
  .page-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .btn {
    width: 100%;
    justify-content: center;
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
}
</style>