<template>
  <AdminLayout>
    <div class="agents-page" v-loading="!authReady && loading">
      <div class="page-header">
        <h1>{{ $t('admin.agents.title') }}</h1>
        <p class="page-desc">{{ $t('admin.agents.desc') }}</p>
      </div>

      <el-alert
        v-if="authReady && !store.isLoggedIn"
        type="warning"
        :title="$t('admin.rbac.needV2Login')"
        show-icon
        class="mb-4"
      />

      <el-card shadow="never" class="agents-card">
        <template #header>
          <div class="card-head">
            <span>{{ $t('admin.agents.list') }}</span>
            <div class="card-actions">
              <el-button size="small" :loading="loading" @click="load">
                <i class="fas fa-sync-alt"></i>
              </el-button>
              <el-button
                v-if="canCreate"
                type="primary"
                size="small"
                @click="openCreateDialog"
              >
                {{ $t('admin.agents.create') }}
              </el-button>
            </div>
          </div>
        </template>

        <el-table :data="agents" v-loading="loading" size="small" stripe>
          <el-table-column :label="$t('admin.users.username')" min-width="120">
            <template #default="{ row }">{{ row.user?.username || '—' }}</template>
          </el-table-column>
          <el-table-column :label="$t('admin.users.email')" min-width="180">
            <template #default="{ row }">{{ row.user?.email || '—' }}</template>
          </el-table-column>
          <el-table-column :label="$t('admin.agents.parent')" width="120">
            <template #default="{ row }">{{ row.parent_username || '—' }}</template>
          </el-table-column>
          <el-table-column :label="$t('admin.agents.commission')" width="110" align="right">
            <template #default="{ row }">{{ formatCommission(row.commission_rate) }}</template>
          </el-table-column>
          <el-table-column :label="$t('admin.agents.revenue')" width="140" align="right">
            <template #default="{ row }">
              <el-tooltip
                v-if="hasCommissionDeduction(row)"
                :content="revenueTooltip(row)"
                placement="top"
              >
                <span class="revenue-cell">{{ formatRevenue(row.revenue) }}</span>
              </el-tooltip>
              <span v-else>{{ formatRevenue(row.revenue) }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="region" :label="$t('admin.agents.region')" width="120">
            <template #default="{ row }">{{ row.region || '—' }}</template>
          </el-table-column>
          <el-table-column :label="$t('admin.orders.status')" width="100" align="center">
            <template #default="{ row }">
              <el-tag :type="row.status === 'active' ? 'success' : 'info'" size="small">
                {{ statusLabel(row.status) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column
            v-if="canManage || isSuperAdmin"
            :label="$t('admin.users.actions')"
            width="130"
            align="center"
            fixed="right"
          >
            <template #default="{ row }">
              <el-button
                v-if="canManage"
                type="primary"
                link
                size="small"
                @click="openEditDialog(row)"
              >
                {{ $t('common.edit') }}
              </el-button>
              <el-button
                v-if="isSuperAdmin"
                type="danger"
                link
                size="small"
                @click="confirmDelete(row)"
              >
                {{ $t('common.delete') }}
              </el-button>
            </template>
          </el-table-column>
          <template #empty>
            <el-empty :description="$t('admin.agents.empty')" />
          </template>
        </el-table>
      </el-card>

      <el-dialog
        v-model="dialogVisible"
        :title="$t('admin.agents.create')"
        width="520px"
        destroy-on-close
        @open="onCreateDialogOpen"
        @closed="resetCreateForm"
      >
        <p class="dialog-hint">{{ $t('admin.agents.createHint') }}</p>
        <el-form ref="formRef" :model="form" :rules="rules" label-width="110px">
            <el-form-item :label="$t('admin.agents.selectUser')" prop="user_id">
            <el-select
              v-model="form.user_id"
              filterable
              remote
              clearable
              reserve-keyword
              popper-class="admin-select-popper"
              :remote-method="onSearchUsers"
              :loading="userSearchLoading"
              :placeholder="$t('admin.agents.selectUserPlaceholder')"
              class="w-full"
            >
              <el-option
                v-for="u in userOptions"
                :key="u.id"
                :label="userOptionLabel(u)"
                :value="u.id"
              />
              <template #empty>
                <p class="select-empty">{{ userSearchLoading ? $t('common.loading') : $t('admin.agents.noEligibleUsers') }}</p>
              </template>
            </el-select>
            <p class="form-hint">{{ $t('admin.agents.selectUserHint') }}</p>
          </el-form-item>
          <el-form-item :label="$t('admin.agents.commission')" prop="commission_rate">
            <el-input-number v-model="form.commission_rate" :min="0" :max="100" :precision="2" class="w-full" />
          </el-form-item>
          <el-form-item :label="$t('admin.agents.region')" prop="region">
            <el-input v-model="form.region" />
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="dialogVisible = false">{{ $t('common.cancel') }}</el-button>
          <el-button type="primary" :loading="saving" @click="submit">{{ $t('common.save') }}</el-button>
        </template>
      </el-dialog>

      <el-dialog
        v-model="editDialogVisible"
        :title="$t('admin.agents.edit')"
        width="520px"
        destroy-on-close
        @closed="resetEditForm"
      >
        <el-form ref="editFormRef" :model="editForm" label-width="110px">
          <el-form-item :label="$t('admin.users.username')">
            <el-input :model-value="editForm.username" disabled />
          </el-form-item>
          <el-form-item :label="$t('admin.agents.commission')">
            <el-input-number
              v-model="editForm.commission_rate"
              :min="0"
              :max="100"
              :precision="2"
              class="w-full"
            />
          </el-form-item>
          <el-form-item :label="$t('admin.agents.region')">
            <el-input v-model="editForm.region" />
          </el-form-item>
          <el-form-item :label="$t('admin.orders.status')">
            <el-select v-model="editForm.status" class="w-full" popper-class="admin-select-popper">
              <el-option :label="$t('admin.agents.statusActive')" value="active" />
              <el-option :label="$t('admin.agents.statusInactive')" value="suspended" />
            </el-select>
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="editDialogVisible = false">{{ $t('common.cancel') }}</el-button>
          <el-button type="primary" :loading="saving" @click="submitEdit">{{ $t('common.save') }}</el-button>
        </template>
      </el-dialog>
    </div>
  </AdminLayout>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import AdminLayout from '@/components/admin/AdminLayout.vue'
import { useAdminPermissions } from '@/composables/useAdminPermission'
import * as agentsApi from '@/services/v2/admin/agents'

const { t } = useI18n()
const { store, authReady, can, isSuperAdmin } = useAdminPermissions()
const canCreate = can('agent.create')
const canManage = can('agent.manage')

const loading = ref(false)
const saving = ref(false)
const userSearchLoading = ref(false)
const userSearchKeyword = ref('')
let userSearchTimer = null
const agents = ref([])
const userOptions = ref([])
const dialogVisible = ref(false)
const editDialogVisible = ref(false)
const formRef = ref(null)
const editFormRef = ref(null)
const form = ref({
  user_id: null,
  commission_rate: 0,
  region: ''
})
const editForm = ref({
  id: null,
  username: '',
  commission_rate: 0,
  region: '',
  status: 'active'
})

const rules = computed(() => ({
  user_id: [{ required: true, message: t('admin.agents.userRequired'), trigger: 'change' }]
}))

const API_ERROR_MAP = {
  'User is already an agent': 'admin.agents.alreadyAgent',
  'Cannot assign agent to super admin': 'admin.agents.cannotAssignAdmin',
  'Cannot delete agent with subordinates': 'admin.agents.hasSubordinates'
}

function statusLabel(status) {
  if (status === 'active') return t('admin.agents.statusActive')
  if (status === 'suspended' || status === 'inactive') return t('admin.agents.statusInactive')
  return status || '—'
}

function formatCommission(rate) {
  const n = Number(rate)
  return Number.isFinite(n) ? `${n}%` : '—'
}

function formatRevenue(amount) {
  const n = Number(amount)
  return Number.isFinite(n) ? `${n.toFixed(2)} USDT` : '—'
}

function hasCommissionDeduction(row) {
  const rate = Number(row.commission_rate)
  const gross = Number(row.gross_revenue)
  return Number.isFinite(rate) && rate > 0 && Number.isFinite(gross) && gross > 0
}

function revenueTooltip(row) {
  return t('admin.agents.revenueTooltip', {
    gross: formatRevenue(row.gross_revenue),
    rate: formatCommission(row.commission_rate)
  })
}

function userOptionLabel(user) {
  return `${user.username} · ${user.email}`
}

function resolveErrorMessage(error) {
  const raw = error?.response?.data?.message
    || error?.response?.data?.errors?.user_id?.[0]
    || ''
  const key = API_ERROR_MAP[raw]
  return key ? t(key) : (raw || t('admin.agents.createFailed'))
}

function resetCreateForm() {
  form.value = { user_id: null, commission_rate: 0, region: '' }
  userOptions.value = []
  formRef.value?.clearValidate()
}

function resetEditForm() {
  editForm.value = {
    id: null,
    username: '',
    commission_rate: 0,
    region: '',
    status: 'active'
  }
  editFormRef.value?.clearValidate()
}

async function searchUsers(query) {
  const keyword = String(query ?? '').trim()
  userSearchKeyword.value = keyword
  userSearchLoading.value = true
  try {
    const { data } = await agentsApi.fetchEligibleUsers(keyword ? { q: keyword } : {})
    userOptions.value = Array.isArray(data) ? data : []
  } catch (e) {
    userOptions.value = []
    ElMessage.error(e.response?.data?.message || t('admin.agents.searchUsersFailed'))
  } finally {
    userSearchLoading.value = false
  }
}

/** 远程搜索防抖，避免每个字符都请求 */
function onSearchUsers(query) {
  if (userSearchTimer) clearTimeout(userSearchTimer)
  userSearchTimer = setTimeout(() => searchUsers(query), 280)
}

function onCreateDialogOpen() {
  userSearchKeyword.value = ''
  searchUsers('')
}

function openCreateDialog() {
  resetCreateForm()
  dialogVisible.value = true
}

function openEditDialog(row) {
  editForm.value = {
    id: row.id,
    username: row.user?.username || '',
    commission_rate: Number(row.commission_rate) || 0,
    region: row.region || '',
    status: row.status === 'suspended' ? 'suspended' : 'active'
  }
  editDialogVisible.value = true
}

async function load() {
  loading.value = true
  try {
    const { data } = await agentsApi.fetchAgents()
    agents.value = data.data || []
    return true
  } catch (e) {
    ElMessage.error(e.response?.data?.message || t('admin.agents.loadFailed'))
    return false
  } finally {
    loading.value = false
  }
}

async function submit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  saving.value = true
  try {
    await agentsApi.createAgent({ ...form.value })
    dialogVisible.value = false
    const refreshed = await load()
    if (refreshed) {
      ElMessage.success(t('admin.agents.createSuccess'))
    }
  } catch (e) {
    ElMessage.error(resolveErrorMessage(e))
  } finally {
    saving.value = false
  }
}

async function submitEdit() {
  if (!editForm.value.id) return

  saving.value = true
  try {
    await agentsApi.updateAgent(editForm.value.id, {
      commission_rate: editForm.value.commission_rate,
      region: editForm.value.region || null,
      status: editForm.value.status
    })
    editDialogVisible.value = false
    const refreshed = await load()
    if (refreshed) {
      ElMessage.success(t('admin.agents.updateSuccess'))
    }
  } catch (e) {
    ElMessage.error(e.response?.data?.message || t('admin.agents.updateFailed'))
  } finally {
    saving.value = false
  }
}

async function confirmDelete(row) {
  const name = row.user?.username || row.id
  try {
    await ElMessageBox.confirm(
      t('admin.agents.deleteConfirm', { name }),
      t('common.delete'),
      {
        type: 'warning',
        confirmButtonText: t('common.delete'),
        cancelButtonText: t('common.cancel')
      }
    )
  } catch {
    return
  }

  try {
    await agentsApi.deleteAgent(row.id)
    const refreshed = await load()
    if (refreshed) {
      ElMessage.success(t('admin.agents.deleteSuccess'))
    }
  } catch (e) {
    ElMessage.error(resolveErrorMessage(e) || t('admin.agents.deleteFailed'))
  }
}

onMounted(load)
</script>

<style scoped>
.agents-page {
  padding: 0 0 2rem;
  animation: fadeIn 0.4s ease;
}

.page-header {
  margin-bottom: 1.5rem;
}

.page-header h1 {
  margin: 0;
  background: var(--gradient-3);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.page-desc {
  color: var(--text-secondary);
  margin-top: 0.5rem;
  line-height: 1.5;
}

.agents-card {
  min-height: 360px;
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  color: var(--text-primary);
  font-weight: 600;
}

.card-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.dialog-hint {
  margin: 0 0 1rem;
  font-size: 0.875rem;
  color: var(--text-secondary);
  line-height: 1.5;
}

.form-hint {
  margin: 0.35rem 0 0;
  font-size: 0.8rem;
  color: var(--text-secondary);
  line-height: 1.4;
}

.select-empty {
  margin: 0;
  padding: 0.5rem 0.75rem;
  font-size: 0.85rem;
  color: var(--text-secondary);
  text-align: center;
}

.mb-4 {
  margin-bottom: 1rem;
}

.w-full {
  width: 100%;
}

.revenue-cell {
  cursor: help;
  border-bottom: 1px dashed rgba(0, 212, 255, 0.35);
}
</style>
