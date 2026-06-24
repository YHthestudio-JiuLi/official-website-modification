<template>
  <AdminLayout>
    <template #header-title>{{ $t('admin.productCategories.title') }}</template>

    <div class="categories-page">
      <div class="page-header">
        <div class="header-content">
          <h2><i class="fas fa-tags"></i> {{ $t('admin.productCategories.title') }}</h2>
          <p>{{ $t('admin.productCategories.subtitle') }}</p>
        </div>
        <router-link to="/admin/products" class="btn btn-secondary">
          <i class="fas fa-arrow-left"></i> {{ $t('admin.productCategories.backProducts') }}
        </router-link>
      </div>

      <div class="form-card">
        <h3 class="section-title">
          <i class="fas fa-plus-circle"></i> {{ editingId ? $t('admin.productCategories.edit') : $t('admin.productCategories.add') }}
        </h3>
        <form class="form" @submit.prevent="handleSave">
          <div class="form-row form-row-2">
            <div class="form-group">
              <label>{{ $t('admin.productCategories.parentCategory') }}</label>
              <select v-model="form.parentId" class="form-input" :disabled="!!editingHasChildren">
                <option :value="null">{{ $t('admin.productCategories.level1') }}</option>
                <option
                  v-for="parent in parentCategories"
                  :key="parent.id"
                  :value="parent.id"
                  :disabled="editingId === parent.id"
                >
                  {{ parent.name }}{{ parent.nameEn ? ` / ${parent.nameEn}` : '' }}
                </option>
              </select>
              <p class="field-hint">{{ $t('admin.productCategories.parentHint') }}</p>
            </div>
            <div class="form-group">
              <label>{{ $t('admin.productCategories.sortOrder') }}</label>
              <input v-model.number="form.sortOrder" type="number" class="form-input" min="0" />
            </div>
          </div>
          <div class="form-row form-row-2">
            <div class="form-group">
              <label>{{ $t('admin.productCategories.name') }} <span class="required">*</span></label>
              <input v-model="form.name" type="text" class="form-input" required />
              <p class="field-hint">{{ $t('admin.productCategories.nameHint') }}</p>
            </div>
            <div class="form-group">
              <label>{{ $t('admin.productCategories.nameEn') }}</label>
              <input v-model="form.nameEn" type="text" class="form-input" :placeholder="$t('admin.productCategories.nameEnPlaceholder')" />
              <p class="field-hint">{{ $t('admin.productCategories.nameEnHint') }}</p>
            </div>
          </div>
          <div class="form-group">
            <label>{{ $t('admin.productCategories.slug') }}</label>
            <input v-model="form.slug" type="text" class="form-input" :placeholder="$t('admin.productCategories.slugPlaceholder')" />
          </div>
          <div class="form-actions">
            <button type="submit" class="btn btn-primary" :disabled="saving">
              <i class="fas fa-save"></i> {{ $t('common.save') }}
            </button>
            <button v-if="editingId" type="button" class="btn btn-secondary" @click="resetForm">
              {{ $t('common.cancel') }}
            </button>
          </div>
        </form>
      </div>

      <div class="table-card">
        <div v-if="loading" class="loading"><i class="fas fa-spinner fa-spin"></i> {{ $t('common.loading') }}</div>
        <table v-else class="data-table">
          <thead>
            <tr>
              <th>{{ $t('admin.productCategories.name') }}</th>
              <th>{{ $t('admin.productCategories.nameEn') }}</th>
              <th>{{ $t('admin.productCategories.parentCategory') }}</th>
              <th>{{ $t('admin.productCategories.slug') }}</th>
              <th>{{ $t('admin.productCategories.sortOrder') }}</th>
              <th>{{ $t('admin.products.actions') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="cat in displayCategories" :key="cat.id" :class="{ 'sub-row': cat.parentId }">
              <td>
                <span v-if="cat.parentId" class="sub-indent">↳</span>
                {{ cat.name }}
              </td>
              <td>{{ cat.nameEn || '—' }}</td>
              <td>{{ parentLabel(cat.parentId) }}</td>
              <td><code>{{ cat.slug }}</code></td>
              <td>{{ cat.sortOrder }}</td>
              <td class="actions">
                <button type="button" class="btn-icon" @click="startEdit(cat)" :title="$t('common.edit')">
                  <i class="fas fa-edit"></i>
                </button>
                <button type="button" class="btn-icon btn-danger" @click="handleDelete(cat)" :title="$t('common.delete')">
                  <i class="fas fa-trash"></i>
                </button>
              </td>
            </tr>
            <tr v-if="displayCategories.length === 0">
              <td colspan="6" class="empty">{{ $t('admin.productCategories.empty') }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </AdminLayout>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  fetchAdminCategories,
  createCategory,
  updateCategory,
  deleteCategory
} from '@/services/v2/catalog'
import AdminLayout from '@/components/admin/AdminLayout.vue'
import { getParentCategories, getSubCategories } from '@/utils/categorySort'

const { t } = useI18n()
const categories = ref([])
const loading = ref(true)
const saving = ref(false)
const editingId = ref(null)
const form = ref({ name: '', nameEn: '', slug: '', sortOrder: 0, parentId: null })

const parentCategories = computed(() => getParentCategories(categories.value))

const displayCategories = computed(() => {
  const result = []
  for (const root of parentCategories.value) {
    result.push(root)
    result.push(...getSubCategories(categories.value, root.id))
  }
  return result
})

const editingHasChildren = computed(() => {
  if (!editingId.value) return false
  return categories.value.some((c) => c.parentId === editingId.value)
})

onMounted(fetchCategories)

async function fetchCategories() {
  loading.value = true
  try {
    const res = await fetchAdminCategories()
    categories.value = res.data || []
  } catch (_e) {
    categories.value = []
  } finally {
    loading.value = false
  }
}

function parentLabel(parentId) {
  if (!parentId) return t('admin.productCategories.level1')
  const parent = categories.value.find((c) => c.id === parentId)
  return parent ? parent.name : '—'
}

function resetForm() {
  editingId.value = null
  form.value = { name: '', nameEn: '', slug: '', sortOrder: 0, parentId: null }
}

function startEdit(cat) {
  editingId.value = cat.id
  form.value = {
    name: cat.name || '',
    nameEn: cat.nameEn || '',
    slug: cat.slug || '',
    sortOrder: cat.sortOrder ?? 0,
    parentId: cat.parentId ?? null
  }
}

async function handleSave() {
  saving.value = true
  try {
    const payload = {
      name: form.value.name.trim(),
      nameEn: form.value.nameEn.trim() || null,
      slug: form.value.slug.trim() || null,
      sortOrder: Number(form.value.sortOrder) || 0,
      parentId: form.value.parentId || null
    }
    if (editingId.value) {
      await updateCategory(editingId.value, payload)
    } else {
      await createCategory(payload)
    }
    resetForm()
    await fetchCategories()
  } catch (err) {
    alert(err.response?.data?.error || t('admin.productCategories.saveFailed'))
  } finally {
    saving.value = false
  }
}

async function handleDelete(cat) {
  if (!confirm(t('admin.productCategories.deleteConfirm', { name: cat.name }))) return
  try {
    await deleteCategory(cat.id)
    if (editingId.value === cat.id) resetForm()
    await fetchCategories()
  } catch (err) {
    alert(err.response?.data?.error || t('admin.productCategories.deleteFailed'))
  }
}
</script>

<style scoped>
.categories-page {
  animation: fadeIn 0.4s ease;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 24px;
}
.page-header h2 {
  margin: 0 0 8px;
  font-size: 1.5rem;
}
.page-header p {
  margin: 0;
  color: var(--admin-text-muted, #8892b0);
}
.form-card,
.table-card {
  background: var(--admin-card-bg, #1a1f2e);
  border-radius: 12px;
  padding: 24px;
  margin-bottom: 24px;
  border: 1px solid rgba(255, 255, 255, 0.06);
}
.section-title {
  margin: 0 0 20px;
  font-size: 1.1rem;
}
.form-row-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
.form-group {
  margin-bottom: 16px;
}
.form-group label {
  display: block;
  margin-bottom: 6px;
  font-size: 14px;
}
.field-hint {
  margin: 6px 0 0;
  font-size: 12px;
  color: #8892b0;
  line-height: 1.4;
}
.form-input {
  width: 100%;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(0, 0, 0, 0.2);
  color: inherit;
}
.required { color: #f87171; }
.form-actions {
  display: flex;
  gap: 12px;
}
.data-table {
  width: 100%;
  border-collapse: collapse;
}
.data-table th,
.data-table td {
  padding: 12px;
  text-align: left;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}
.sub-row td:first-child {
  padding-left: 28px;
}
.sub-indent {
  color: #8892b0;
  margin-right: 6px;
}
.actions {
  display: flex;
  gap: 8px;
}
.btn-icon {
  background: transparent;
  border: none;
  color: inherit;
  cursor: pointer;
  padding: 6px;
  opacity: 0.8;
}
.btn-icon:hover { opacity: 1; }
.btn-danger { color: #f87171; }
.empty {
  text-align: center;
  color: #8892b0;
  padding: 24px;
}
.loading {
  text-align: center;
  padding: 24px;
  color: #8892b0;
}
@media (max-width: 768px) {
  .form-row-2 { grid-template-columns: 1fr; }
}
</style>
