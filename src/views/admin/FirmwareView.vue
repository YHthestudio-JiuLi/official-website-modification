<template>
  <div class="firmware-page">
      <div class="page-header">
        <div class="header-content">
          <h2>
            <i class="fas fa-microchip"></i>
            {{ $t('admin.firmware.listTitle') }}
          </h2>
          <p>{{ $t('admin.firmware.description') }}</p>
        </div>
        <div v-if="canEdit" class="header-actions">
          <input ref="firmwareInputRef" type="file" class="firmware-file-input" @change="onFirmwareFileChange" />
          <button type="button" class="btn btn-primary" :disabled="firmwareUploading" @click="triggerFirmwareSelect">
            <i class="fas fa-upload"></i>
            <span>
              {{ firmwareUploading
                ? $t('admin.firmware.uploading', { progress: firmwareUploadProgress })
                : $t('admin.firmware.upload') }}
            </span>
          </button>
          <button
            v-if="!isScopedAgent"
            type="button"
            class="btn btn-secondary"
            :disabled="firmwareUploading"
            @click="registerFirmwareFromServer"
          >
            <i class="fas fa-server"></i>
            <span>{{ $t('admin.firmware.registerFromServer') }}</span>
          </button>
        </div>
      </div>

      <div v-if="!canAccessPage" class="no-permission-card">
        <i class="fas fa-lock"></i>
        <p>{{ $t('admin.firmware.noPermission') }}</p>
      </div>

      <div v-else-if="firmwareLoading" class="loading-container">
        <div class="loading-spinner">
          <i class="fas fa-spinner fa-spin"></i>
          <span>{{ $t('admin.firmware.loading') }}</span>
        </div>
      </div>

      <div v-else class="table-card">
        <div class="table-header">
          <div class="table-info">
            <i class="fas fa-microchip"></i>
            <span>{{ $t('admin.firmware.count', { total: firmwareItems.length }) }}</span>
          </div>
        </div>

        <div class="table-info-bar">
          <p class="info-text">
            <i class="fas fa-info-circle"></i>
            {{ $t('admin.firmware.tableHint') }}
          </p>
        </div>

        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>{{ $t('admin.firmware.colFileName') }}</th>
                <th>{{ $t('admin.firmware.colRemark') }}</th>
                <th>{{ $t('admin.firmware.colFileSize') }}</th>
                <th>{{ $t('admin.firmware.colChecksum') }}</th>
                <th>{{ $t('admin.firmware.colDefault') }}</th>
                <th>{{ $t('admin.firmware.colCreatedAt') }}</th>
                <AdminCreatedByHeader :show-column="!isScopedAgent" />
                <th class="text-center">{{ $t('admin.firmware.colActions') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in tableItems" :key="item.id">
                <td>
                  <span class="id-badge">#{{ item.id }}</span>
                </td>
                <td>
                  <span class="file-name">
                    <i class="fas fa-file-archive"></i>
                    {{ item.file_name }}
                  </span>
                </td>
                <td>
                  <div v-if="canEdit" class="remark-cell">
                    <template v-if="editingRemarkId === item.id">
                      <input
                        :data-remark-input="item.id"
                        v-model="inlineRemarkDraft"
                        type="text"
                        class="remark-inline-input"
                        maxlength="500"
                        :placeholder="$t('admin.firmware.remarkPlaceholder')"
                        :disabled="remarkSavingId === item.id"
                        @blur="commitInlineRemark(item)"
                        @keydown.enter.prevent="commitInlineRemark(item)"
                        @keydown.esc.prevent="cancelInlineRemark"
                      />
                      <i
                        v-if="remarkSavingId === item.id"
                        class="fas fa-spinner fa-spin remark-saving-icon"
                      />
                    </template>
                    <template v-else>
                      <span
                        v-if="item.remark"
                        class="remark-text"
                        :title="item.remark"
                      >{{ item.remark }}</span>
                      <span v-else class="empty-cell">{{ $t('admin.firmware.noRemark') }}</span>
                      <button
                        type="button"
                        class="remark-edit-btn"
                        :title="$t('admin.firmware.editRemarkTitle')"
                        @click="startInlineRemark(item)"
                      >
                        <i class="fas fa-pen"></i>
                      </button>
                    </template>
                  </div>
                  <span
                    v-else-if="item.remark"
                    class="remark-text readonly"
                    :title="item.remark"
                  >{{ item.remark }}</span>
                  <span v-else class="empty-cell">-</span>
                </td>
                <td>
                  <span class="size-cell">{{ formatFirmwareSize(item.file_size) }}</span>
                </td>
                <td>
                  <span
                    v-if="item.checksum_sha256"
                    class="checksum-cell"
                    :title="item.checksum_sha256"
                  >
                    {{ item.checksum_sha256.slice(0, 12) }}...
                  </span>
                  <span v-else class="empty-cell">-</span>
                </td>
                <td>
                  <span v-if="item.is_default">{{ $t('admin.users.yes') }}</span>
                  <span v-else class="empty-cell">-</span>
                </td>
                <td>
                  <span class="date-cell">{{ item.createdAtText }}</span>
                </td>
                <AdminCreatedByCell :show-cell="!isScopedAgent" :username="item.created_by_username" />
                <td class="actions-cell">
                  <div v-if="canEdit || canDelete" class="action-group">
                    <button
                      v-if="canEdit && !isScopedAgent"
                      type="button"
                      class="action-btn btn-default"
                      :disabled="item.is_default"
                      :title="$t('admin.firmware.setDefault')"
                      @click="setDefaultFirmware(item)"
                    >
                      <i class="fas fa-thumbtack"></i>
                      <span class="action-text">{{ $t('admin.firmware.setDefault') }}</span>
                    </button>
                    <button
                      v-if="canDelete"
                      type="button"
                      class="action-btn btn-delete"
                      :title="$t('admin.firmware.deleteTitle')"
                      @click="confirmDelete(item)"
                    >
                      <i class="fas fa-trash"></i>
                      <span class="action-text">{{ $t('common.delete') }}</span>
                    </button>
                  </div>
                  <span v-else class="empty-cell">-</span>
                </td>
              </tr>
              <tr v-if="firmwareItems.length === 0">
                <td :colspan="isScopedAgent ? 8 : 9" class="empty-state">
                  <i class="fas fa-microchip"></i>
                  <h3>{{ $t('admin.firmware.emptyAllTitle') }}</h3>
                  <p>{{ $t('admin.firmware.emptyAllDesc') }}</p>
                  <div v-if="canEdit" class="empty-actions">
                    <button type="button" class="btn btn-primary" :disabled="firmwareUploading" @click="triggerFirmwareSelect">
                      <i class="fas fa-upload"></i> {{ $t('admin.firmware.upload') }}
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div v-if="showUploadModal" class="modal-overlay" @click="closeUploadModal">
        <div class="modal-container" @click.stop>
          <div class="modal-header">
            <i class="fas fa-upload"></i>
            <h3>{{ $t('admin.firmware.uploadModalTitle') }}</h3>
          </div>
          <div class="modal-body">
            <p class="upload-file-name">
              <i class="fas fa-file-archive"></i>
              <strong>{{ pendingUploadFile?.name }}</strong>
            </p>
            <label class="form-label" for="uploadRemark">{{ $t('admin.firmware.remarkLabel') }}</label>
            <textarea
              id="uploadRemark"
              v-model.trim="uploadRemark"
              class="form-textarea"
              rows="3"
              maxlength="500"
              :placeholder="$t('admin.firmware.remarkPlaceholder')"
            />
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" :disabled="firmwareUploading" @click="closeUploadModal">
              <i class="fas fa-times"></i> {{ $t('common.cancel') }}
            </button>
            <button type="button" class="btn btn-primary" :disabled="firmwareUploading" @click="confirmUpload">
              <i :class="firmwareUploading ? 'fas fa-spinner fa-spin' : 'fas fa-upload'"></i>
              {{ firmwareUploading
                ? $t('admin.firmware.uploading', { progress: firmwareUploadProgress })
                : $t('admin.firmware.uploadConfirm') }}
            </button>
          </div>
        </div>
      </div>

      <div v-if="showRegisterModal" class="modal-overlay" @click="closeRegisterModal">
        <div class="modal-container" @click.stop>
          <div class="modal-header">
            <i class="fas fa-server"></i>
            <h3>{{ $t('admin.firmware.registerModalTitle') }}</h3>
          </div>
          <div class="modal-body">
            <label class="form-label" for="registerFileName">{{ $t('admin.firmware.colFileName') }}</label>
            <input
              id="registerFileName"
              v-model.trim="registerFileName"
              type="text"
              class="form-input"
              :placeholder="$t('admin.firmware.registerFromServerPrompt')"
            />
            <label class="form-label" for="registerRemark">{{ $t('admin.firmware.remarkLabel') }}</label>
            <textarea
              id="registerRemark"
              v-model.trim="registerRemark"
              class="form-textarea"
              rows="3"
              maxlength="500"
              :placeholder="$t('admin.firmware.remarkPlaceholder')"
            />
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" @click="closeRegisterModal">
              <i class="fas fa-times"></i> {{ $t('common.cancel') }}
            </button>
            <button type="button" class="btn btn-primary" :disabled="registerSubmitting" @click="confirmRegisterFromServer">
              <i :class="registerSubmitting ? 'fas fa-spinner fa-spin' : 'fas fa-check'"></i>
              {{ $t('common.confirm') }}
            </button>
          </div>
        </div>
      </div>

      <div v-if="showDeleteModal" class="modal-overlay" @click="closeDeleteModal">
        <div class="modal-container" @click.stop>
          <div class="modal-header danger">
            <i class="fas fa-exclamation-triangle"></i>
            <h3>{{ $t('admin.firmware.deleteModalTitle') }}</h3>
          </div>
          <div class="modal-body">
            <p>{{ $t('admin.firmware.deleteModalText') }}</p>
            <div class="firmware-info-box">
              <p class="firmware-name-text"><strong>{{ firmwareToDelete?.file_name }}</strong></p>
              <p class="firmware-meta">ID: {{ firmwareToDelete?.id }}</p>
            </div>
          </div>
          <div class="modal-footer">
            <button @click="closeDeleteModal" class="btn btn-secondary">
              <i class="fas fa-times"></i> {{ $t('common.cancel') }}
            </button>
            <button @click="executeDelete" class="btn btn-danger">
              <i class="fas fa-trash"></i> {{ $t('admin.firmware.deleteConfirm') }}
            </button>
          </div>
        </div>
      </div>

      <div v-if="toast.visible" :class="['toast', toast.type]">
        <i :class="toast.type === 'success' ? 'fas fa-check-circle' : 'fas fa-exclamation-circle'"></i>
        <span>{{ toast.message }}</span>
      </div>
    </div>
</template>

<script setup>
import AdminCreatedByHeader from '@/components/admin/AdminCreatedByHeader.vue'
import AdminCreatedByCell from '@/components/admin/AdminCreatedByCell.vue'
import { useFirmwareAdmin } from '@/composables/useFirmwareAdmin'

const {
  isScopedAgent,
  canEdit,
  canDelete,
  canAccessPage,
  firmwareItems,
  firmwareLoading,
  firmwareUploading,
  firmwareUploadProgress,
  firmwareInputRef,
  showDeleteModal,
  firmwareToDelete,
  showUploadModal,
  pendingUploadFile,
  uploadRemark,
  showRegisterModal,
  registerFileName,
  registerRemark,
  registerSubmitting,
  editingRemarkId,
  inlineRemarkDraft,
  remarkSavingId,
  tableItems,
  toast,
  triggerFirmwareSelect,
  onFirmwareFileChange,
  closeUploadModal,
  confirmUpload,
  registerFirmwareFromServer,
  closeRegisterModal,
  confirmRegisterFromServer,
  startInlineRemark,
  commitInlineRemark,
  setDefaultFirmware,
  confirmDelete,
  closeDeleteModal,
  executeDelete,
  formatFirmwareSize,
} = useFirmwareAdmin()
</script>

<style scoped src="./firmware-view.css"></style>
