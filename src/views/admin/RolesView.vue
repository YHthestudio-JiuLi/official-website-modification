<template>
  <div class="rbac-page">
      <div class="page-header">
        <h1>{{ $t('admin.rbac.title') }}</h1>
        <p class="page-desc">{{ $t('admin.rbac.desc') }}</p>
      </div>

      <el-alert
        v-if="authReady && !store.isLoggedIn"
        type="warning"
        :title="$t('admin.rbac.needV2Login')"
        show-icon
        class="mb-4"
      />

      <el-row :gutter="20" v-loading="loading">
        <el-col :xs="24" :md="10">
          <el-card shadow="never" class="roles-card">
            <template #header>
              <div class="card-head">
                <span>{{ $t('admin.rbac.roles') }}</span>
                <el-button
                  v-if="canManageRoles"
                  type="primary"
                  size="small"
                  @click="openRoleDialog()"
                >
                  {{ $t('admin.rbac.addRole') }}
                </el-button>
              </div>
            </template>
            <el-table
              :data="roles"
              size="small"
              highlight-current-row
              :current-row-key="selectedRole?.id"
              :row-class-name="roleRowClass"
              row-key="id"
              @row-click="selectRole"
            >
              <el-table-column :label="$t('admin.rbac.roleName')" min-width="140">
                <template #default="{ row }">
                  <span class="role-name">{{ roleLabel(row.name) }}</span>
                  <span v-if="roleLabel(row.name) !== row.name" class="role-code">{{ row.name }}</span>
                </template>
              </el-table-column>
              <el-table-column :label="$t('admin.rbac.permCount')" width="80" align="center">
                <template #default="{ row }">{{ row.permissions?.length || 0 }}</template>
              </el-table-column>
              <el-table-column :label="$t('common.actions')" width="80" align="center">
                <template #default="{ row }">
                  <el-button
                    v-if="canManageRoles && row.name !== 'super_admin'"
                    link
                    type="primary"
                    @click.stop="openRoleDialog(row)"
                  >
                    {{ $t('common.edit') }}
                  </el-button>
                </template>
              </el-table-column>
              <template #empty>
                <el-empty :description="$t('admin.rbac.noRoles')" :image-size="64" />
              </template>
            </el-table>
          </el-card>
        </el-col>

        <el-col :xs="24" :md="14">
          <el-card shadow="never" class="perms-card">
            <template #header>
              <div class="card-head perms-head">
                <span class="perms-title">
                  {{ selectedRole
                    ? $t('admin.rbac.permissionsFor', { name: roleLabel(selectedRole.name) })
                    : $t('admin.rbac.selectRoleHint') }}
                </span>
                <span
                  v-if="selectedRole && canEditSelectedRole && (permissionSaving || showSavedHint)"
                  class="save-status"
                  :class="{ saving: permissionSaving }"
                >
                  <i :class="permissionSaving ? 'fas fa-spinner fa-spin' : 'fas fa-check-circle'"></i>
                  {{ permissionSaving ? $t('admin.rbac.autoSaving') : $t('admin.rbac.autoSaved') }}
                </span>
              </div>
            </template>

            <template v-if="selectedRole">
              <el-alert
                v-if="selectedRole.name === 'super_admin'"
                type="info"
                :title="$t('admin.rbac.superAdminLocked')"
                show-icon
                :closable="false"
                class="mb-4"
              />

              <div v-else class="perm-tree-wrap">
                <el-tree
                  ref="permTreeRef"
                  :data="permissionTree"
                  show-checkbox
                  node-key="id"
                  default-expand-all
                  :props="treeProps"
                  :disabled="!canEditSelectedRole || permissionSaving"
                  class="perm-tree"
                  @check="onPermTreeCheck"
                >
                  <template #default="{ data }">
                    <div class="tree-node" :class="{ 'is-module': data.isModule }">
                      <span class="tree-label">{{ data.label }}</span>
                      <span v-if="data.desc" class="tree-desc">{{ data.desc }}</span>
                    </div>
                  </template>
                </el-tree>
              </div>
            </template>

            <el-empty v-else :description="$t('admin.rbac.selectRoleHint')" :image-size="80" />
          </el-card>
        </el-col>
      </el-row>

      <el-dialog
        v-model="roleDialogVisible"
        :title="roleForm.id ? $t('admin.rbac.editRole') : $t('admin.rbac.addRole')"
        width="420px"
        destroy-on-close
      >
        <el-form ref="roleFormRef" :model="roleForm" :rules="roleRules" label-width="100px">
          <el-form-item :label="$t('admin.rbac.roleName')" prop="name">
            <el-input v-model="roleForm.name" :disabled="roleForm.id && roleForm.name === 'super_admin'" />
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="roleDialogVisible = false">{{ $t('common.cancel') }}</el-button>
          <el-button type="primary" :loading="saving" @click="submitRole">{{ $t('common.save') }}</el-button>
        </template>
      </el-dialog>
    </div>
</template>

<script setup>
import { computed, nextTick, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { useAdminPermissions } from '@/composables/useAdminPermission'
import * as rolesApi from '@/services/v2/admin/roles'

const { t, te } = useI18n()
const { store, authReady, can } = useAdminPermissions()
const canManageRoles = can('role.manage')

const treeProps = { label: 'label', children: 'children', disabled: 'disabled' }

const loading = ref(false)
const saving = ref(false)
const permissionSaving = ref(false)
const showSavedHint = ref(false)
const skipTreeSync = ref(false)
const roles = ref([])
const allPermissions = ref([])
const selectedRole = ref(null)
const lastSavedPermissions = ref([])
const roleDialogVisible = ref(false)
const roleFormRef = ref(null)
const permTreeRef = ref(null)
const roleForm = ref({ id: null, name: '' })

let saveTimer = null
let savedHintTimer = null

const roleRules = computed(() => ({
  name: [{ required: true, message: t('admin.rbac.roleNameRequired'), trigger: 'blur' }]
}))

const canEditSelectedRole = computed(() => {
  if (!canManageRoles.value) return false
  if (selectedRole.value?.name === 'super_admin') return false
  return true
})

/** 模块 → 权限叶子，供 el-tree 展示 */
const permissionTree = computed(() => {
  const map = {}
  for (const perm of allPermissions.value) {
    const mod = perm.split('.')[0]
    if (!map[mod]) map[mod] = []
    map[mod].push(perm)
  }

  return Object.keys(map)
    .sort((a, b) => moduleLabel(a).localeCompare(moduleLabel(b), 'zh'))
    .map((module) => ({
      id: `__module__:${module}`,
      label: moduleLabel(module),
      isModule: true,
      children: map[module]
        .sort()
        .map((perm) => ({
          id: perm,
          label: permLabel(perm),
          desc: permDesc(perm),
          isModule: false,
        })),
    }))
})

function roleLabel(name) {
  const key = `admin.rbac.roleNames.${name}`
  return te(key) ? t(key) : name
}

function moduleLabel(module) {
  const key = `admin.rbac.permModules.${module}`
  return te(key) ? t(key) : module
}

function permLabel(perm) {
  const key = `admin.rbac.perm.${perm}`
  return te(key) ? t(key) : perm
}

function permDesc(perm) {
  const key = `admin.rbac.permDesc.${perm}`
  return te(key) ? t(key) : ''
}

function roleRowClass({ row }) {
  return row.id === selectedRole.value?.id ? 'role-row-active' : ''
}

function permissionsEqual(a, b) {
  if (a.length !== b.length) return false
  const sa = [...a].sort()
  const sb = [...b].sort()
  return sa.every((v, i) => v === sb[i])
}

function readCheckedPermissions() {
  const keys = permTreeRef.value?.getCheckedKeys(true) || []
  return keys.filter((k) => allPermissions.value.includes(k))
}

async function applyTreeCheckedKeys(perms) {
  await nextTick()
  permTreeRef.value?.setCheckedKeys(perms, false)
}

async function load() {
  loading.value = true
  try {
    const [rolesRes, permsRes] = await Promise.all([
      rolesApi.fetchRoles(),
      rolesApi.fetchPermissions(),
    ])
    roles.value = rolesRes.data
    allPermissions.value = permsRes.data
    if (selectedRole.value) {
      const fresh = roles.value.find((r) => r.id === selectedRole.value.id)
      if (fresh) await selectRole(fresh)
    }
  } catch (e) {
    ElMessage.error(e.response?.data?.message || t('admin.rbac.loadFailed'))
  } finally {
    loading.value = false
  }
}

async function selectRole(row) {
  skipTreeSync.value = true
  selectedRole.value = row
  const perms = [...(row.permissions || [])]
  lastSavedPermissions.value = [...perms]
  showSavedHint.value = false
  await applyTreeCheckedKeys(perms)
  skipTreeSync.value = false
}

function openRoleDialog(row = null) {
  roleForm.value = row
    ? { id: row.id, name: row.name }
    : { id: null, name: '' }
  roleDialogVisible.value = true
}

async function submitRole() {
  const valid = await roleFormRef.value?.validate().catch(() => false)
  if (!valid) return

  saving.value = true
  try {
    if (roleForm.value.id) {
      await rolesApi.updateRole(roleForm.value.id, { name: roleForm.value.name })
    } else {
      await rolesApi.createRole({ name: roleForm.value.name, permissions: [] })
    }
    roleDialogVisible.value = false
    await load()
    ElMessage.success(t('admin.rbac.saveSuccess'))
  } catch (e) {
    ElMessage.error(e.response?.data?.message || t('admin.rbac.saveFailed'))
  } finally {
    saving.value = false
  }
}

async function autoSavePermissions(perms) {
  if (!selectedRole.value || !canEditSelectedRole.value) return
  if (permissionsEqual(perms, lastSavedPermissions.value)) return

  permissionSaving.value = true
  showSavedHint.value = false
  try {
    await rolesApi.updateRole(selectedRole.value.id, { permissions: perms })
    lastSavedPermissions.value = [...perms]

    const idx = roles.value.findIndex((r) => r.id === selectedRole.value.id)
    if (idx >= 0) {
      const updated = { ...roles.value[idx], permissions: [...perms] }
      roles.value[idx] = updated
      selectedRole.value = updated
    }

    showSavedHint.value = true
    clearTimeout(savedHintTimer)
    savedHintTimer = setTimeout(() => {
      showSavedHint.value = false
    }, 2000)
  } catch (e) {
    skipTreeSync.value = true
    await applyTreeCheckedKeys(lastSavedPermissions.value)
    skipTreeSync.value = false
    ElMessage.error(e.response?.data?.message || t('admin.rbac.saveFailed'))
  } finally {
    permissionSaving.value = false
  }
}

function onPermTreeCheck() {
  if (skipTreeSync.value) return
  if (!selectedRole.value || !canEditSelectedRole.value) return

  const perms = readCheckedPermissions()
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => autoSavePermissions(perms), 450)
}

onMounted(load)
</script>

<style scoped>
.rbac-page {
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

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  color: var(--text-primary);
  font-weight: 600;
}

.perms-head {
  flex-wrap: wrap;
}

.perms-title {
  color: var(--text-primary);
}

.save-status {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.8rem;
  font-weight: 400;
  color: var(--text-secondary);
}

.save-status.saving {
  color: var(--primary-color);
}

.save-status .fa-check-circle {
  color: #43e97b;
}

.roles-card,
.perms-card {
  min-height: 420px;
}

.perm-tree-wrap {
  max-height: min(68vh, 640px);
  overflow-y: auto;
  padding: 0.5rem 0.25rem;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.12);
  border: 1px solid var(--border-color);
}

.perm-tree-wrap::-webkit-scrollbar {
  width: 6px;
}

.perm-tree-wrap::-webkit-scrollbar-thumb {
  background: rgba(0, 212, 255, 0.25);
  border-radius: 3px;
}

.perm-tree {
  background: transparent;
}

.perm-tree :deep(.el-tree-node__content) {
  align-items: flex-start;
  padding-top: 6px;
  padding-bottom: 6px;
}

.tree-node {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 2px 0 4px;
  line-height: 1.4;
}

.tree-node.is-module .tree-label {
  font-weight: 600;
  color: var(--primary-color);
}

.tree-label {
  color: var(--text-primary);
  font-weight: 500;
}

.tree-desc {
  font-size: 0.75rem;
  color: var(--text-secondary);
  line-height: 1.35;
}

.role-name {
  font-weight: 500;
  color: var(--text-primary);
}

.role-code {
  display: block;
  font-size: 0.75rem;
  color: var(--text-secondary);
  font-family: ui-monospace, monospace;
  margin-top: 2px;
}

.mb-4 {
  margin-bottom: 1rem;
}

@media (max-width: 992px) {
  .perms-card {
    margin-top: 1rem;
  }

  .perm-tree-wrap {
    max-height: none;
  }
}
</style>
