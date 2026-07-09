<template>
  <div class="device-page">
      <div class="page-header">
        <div class="header-content">
          <h2>
            <i class="fas fa-shield-alt"></i>
            {{ $t('admin.deviceVerification.title') }}
          </h2>
          <p>{{ $t('admin.deviceVerification.description') }}</p>
        </div>
        <div class="header-actions">
          <button v-if="canManage" @click="showAddModal = true" class="btn btn-primary">
            <i class="fas fa-plus"></i>
            <span>{{ $t('admin.deviceVerification.addDevice') }}</span>
          </button>
          <button
            v-if="canManage && selectedDevices.length > 0"
            @click="confirmBatchDelete"
            class="btn btn-danger"
          >
            <i class="fas fa-trash"></i>
            <span>{{ $t('admin.deviceVerification.deleteSelected') }} ({{ selectedDevices.length }})</span>
            <!-- <span class="count-badge-btn"></span> -->
          </button>
        </div>
      </div>

      <AdminNoPermissionCard v-if="!canAccessPage" message-key="admin.deviceVerification.noPermission" />

      <template v-else>
      <div v-if="canManageGlobalSettings" class="global-settings-card" id="device-global-settings">
        <div class="global-settings-header">
          <h3><i class="fas fa-sliders-h"></i> {{ $t('admin.deviceVerification.globalSettingsTitle') }}</h3>
          <p>{{ $t('admin.deviceVerification.globalSettingsHint') }}</p>
        </div>

      <div class="cooldown-settings-bar cooldown-settings-bar--nested">
        <div class="cooldown-settings-main">
          <div class="cooldown-settings-icon" aria-hidden="true">
            <i class="fas fa-clock"></i>
          </div>
          <div class="cooldown-settings-text">
            <h3>{{ $t('admin.deviceVerification.cooldownTitle') }}</h3>
            <p>{{ $t('admin.deviceVerification.cooldownHint') }}</p>
          </div>
        </div>
        <div class="cooldown-settings-controls">
          <label class="settings-label" for="cooldownHoursInput">{{ $t('admin.deviceVerification.cooldownHours') }}</label>
          <input
            id="cooldownHoursInput"
            v-model.number="cooldownHours"
            type="number"
            min="0"
            max="8760"
            step="0.1"
            class="form-input cooldown-input"
          />
          <button type="button" class="btn btn-primary btn-compact" :disabled="settingsSaving" @click="saveCooldownSettings">
            <i class="fas fa-save"></i>
            {{ settingsSaving ? $t('common.loading') : $t('common.save') }}
          </button>
        </div>
      </div>

      <div class="signing-settings-row" id="signing-key-settings">
        <div class="signing-settings-label">
          <i class="fas fa-key" aria-hidden="true"></i>
          <span>{{ $t('admin.deviceVerification.signingKeyTitle') }}</span>
          <span
            class="signing-badge"
            :class="signingKeyConfigured ? 'signing-badge--ok' : 'signing-badge--warn'"
          >
            {{ signingKeyConfigured ? $t('admin.deviceVerification.signingKeyConfigured') : $t('admin.deviceVerification.signingKeyNotConfigured') }}
          </span>
        </div>
        <div class="signing-settings-input-wrap">
          <input
            id="signingPrivateKeyInput"
            v-model="signingPrivateKeyInput"
            type="password"
            class="form-input signing-private-input"
            :placeholder="$t('admin.deviceVerification.signingPrivateKeyPlaceholder')"
            autocomplete="off"
            spellcheck="false"
            :disabled="signingKeySaving"
            @input="scheduleSigningKeyAutoSave"
          />
          <span v-if="signingKeySaving" class="signing-saving" aria-live="polite">
            <i class="fas fa-spinner fa-spin"></i>
          </span>
        </div>
      </div>
      </div>

      <div v-if="loading" class="loading-container">
        <div class="loading-spinner">
          <i class="fas fa-spinner fa-spin"></i>
          <span>{{ $t('admin.deviceVerification.loadingDevices') }}</span>
        </div>
      </div>

      <div v-else class="table-card">
        <div class="table-header">
          <div class="table-info">
            <i class="fas fa-shield-alt"></i>
            <span>{{ $t('admin.deviceVerification.totalDevices') }} <strong>{{ devices.length }}</strong> {{ $t('admin.deviceVerification.registeredDevices') }}</span>
          </div>
          <div class="table-actions">
            <label class="select-all-label">
              <input type="checkbox" v-model="selectAll" @change="toggleSelectAll" />
              <span>{{ $t('admin.deviceVerification.selectAll') }}</span>
            </label>
          </div>
        </div>

        <div class="table-info-bar">
          <p class="info-text">
            <i class="fas fa-info-circle"></i>
            {{ $t('admin.deviceVerification.infoText') }}
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
                <th>{{ $t('admin.deviceVerification.deviceId') }}</th>
                <th>{{ $t('admin.deviceVerification.questionBank') }}</th>
                <th>{{ $t('admin.deviceVerification.firmwareVersion') }}</th>
                <th>{{ $t('admin.deviceVerification.verificationCount') }}</th>
                <th>{{ $t('admin.deviceVerification.maxVerifications') }}</th>
                <th>{{ $t('admin.deviceVerification.remaining') }}</th>
                <th>{{ $t('admin.deviceVerification.deviceStatus') }}</th>
                <th>{{ $t('admin.deviceVerification.presetFingerprint') }}</th>
                <AdminCreatedByHeader :show-column="!isScopedAgent" />
                <th>{{ $t('admin.deviceVerification.createdAt') }}</th>
                <th class="text-center">{{ $t('admin.deviceVerification.actions') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="device in devices" :key="device.id" :class="{ 'selected-row': selectedDevices.includes(device.id) }">
                <td class="select-column">
                  <input type="checkbox" v-model="selectedDevices" :value="device.id" />
                </td>
                <td>
                  <span class="id-badge">#{{ device.id }}</span>
                </td>
                <td>
                  <span class="device-id-cell" :title="device.device_id">{{ device.device_id }}</span>
                </td>
                <td>
                  <span v-if="device.question_name" class="question-badge" :title="device.question_name">
                    <i class="fas fa-book"></i> 
                    <span class="question-name-text">{{ device.question_name }}</span>
                  </span>
                  <span v-else class="no-question-badge">-</span>
                </td>
                <td>
                  <span v-if="device.firmware_name" class="firmware-chip" :title="device.firmware_name">
                    <i class="fas fa-microchip"></i>
                    <span class="question-name-text">{{ device.firmware_name }}</span>
                  </span>
                  <span v-else class="no-question-badge">-</span>
                </td>
                <td>
                  <span class="count-badge">{{ device.verification_count }}</span>
                </td>
                <td>
                  <span class="max-badge">{{ device.max_verifications }}</span>
                </td>
                <td>
                  <span :class="['remaining-badge', getRemainingClass(device)]">
                    {{ device.max_verifications - device.verification_count }}
                  </span>
                </td>
                <td>
                  <span :class="['remaining-badge', Number(device.is_whitelisted) === 1 ? 'remaining-ok' : 'remaining-zero']">
                    {{ Number(device.is_whitelisted) === 1 ? $t('admin.deviceVerification.statusEnabled') : $t('admin.deviceVerification.statusDisabled') }}
                  </span>
                </td>
                <td>
                  <span class="fingerprint-cell" :title="device.device_fingerprint || '-'">
                    {{ formatFingerprint(device.device_fingerprint) }}
                  </span>
                </td>
                <AdminCreatedByCell :show-cell="!isScopedAgent" :username="device.created_by_username" />
                <td>
                  <span class="date-cell" :title="formatFullDate(device.created_at)">{{ formatDate(device.created_at) }}</span>
                </td>
                <td class="actions-cell">
                  <div
                    class="action-menu"
                    :class="{ open: openActionMenuDevice?.id === device.id }"
                    @click.stop
                  >
                    <button
                      type="button"
                      class="action-menu-trigger"
                      :data-action-menu-trigger="device.id"
                      :aria-expanded="openActionMenuDevice?.id === device.id"
                      :title="$t('admin.deviceVerification.moreActions')"
                      @click="toggleActionMenu(device, $event)"
                    >
                      <i class="fas fa-ellipsis-h"></i>
                      <span>{{ $t('admin.deviceVerification.moreActions') }}</span>
                      <i class="fas fa-chevron-down action-menu-caret"></i>
                    </button>
                  </div>
                </td>
              </tr>
              <tr v-if="devices.length === 0">
                <td colspan="12" class="empty-state">
                  <i class="fas fa-shield-alt"></i>
                  <h3>{{ $t('admin.deviceVerification.empty') }}</h3>
                  <p>{{ $t('admin.deviceVerification.emptyHint') }}</p>
                  <button @click="showAddModal = true" class="btn btn-primary">
                    <i class="fas fa-plus"></i> {{ $t('admin.deviceVerification.addDevice') }}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="scroll-indicator">
          <i class="fas fa-arrows-alt-h"></i>
          <span>{{ $t('admin.deviceVerification.scrollHint') }}</span>
        </div>
      </div>

      <!-- Add Device Modal -->
      <div v-if="showAddModal" class="modal-overlay" @click="closeAddModal">
        <div class="modal-container" @click.stop>
          <div class="modal-header">
            <i class="fas fa-plus-circle"></i>
            <h3>{{ $t('admin.deviceVerification.addDevice') }}</h3>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label>{{ $t('admin.deviceVerification.deviceId') }}</label>
              <input
                v-model="newDevice.device_id"
                type="text"
                class="form-input"
                :placeholder="$t('admin.deviceVerification.deviceIdPlaceholder')"
                @keyup.enter="addDevice"
              />
              <p class="form-hint">{{ $t('admin.deviceVerification.deviceIdHint') }}</p>
            </div>
            <div class="form-group">
              <label>{{ $t('admin.deviceVerification.maxVerifications') }}</label>
              <input
                v-model.number="newDevice.max_verifications"
                type="number"
                class="form-input"
                min="1"
                max="1000000"
              />
              <p class="form-hint">{{ $t('admin.deviceVerification.maxVerificationsHint') }}</p>
            </div>
            <div class="form-group">
              <label>{{ $t('admin.deviceVerification.questionBank') }}</label>
              <select v-model="newDevice.question_id" class="form-input">
                <option value="">{{ $t('admin.deviceVerification.noQuestionBank') }}</option>
                <option v-for="q in questions" :key="q.id" :value="q.id">{{ q.name }}</option>
              </select>
              <p class="form-hint">{{ $t('admin.deviceVerification.questionBankHint') }}</p>
            </div>
            <div class="form-group">
              <label>{{ $t('admin.deviceVerification.firmwareVersion') }}</label>
              <select v-model="newDevice.firmware_id" class="form-input">
                <option value="">{{ $t('admin.deviceVerification.firmwareNone') }}</option>
                <option v-for="f in firmwareItems" :key="f.id" :value="f.id">{{ f.file_name }}{{ f.is_default ? $t('admin.deviceVerification.firmwareDefaultOptionSuffix') : '' }}</option>
              </select>
              <p class="form-hint">{{ $t('admin.deviceVerification.firmwareHintDevice') }}</p>
            </div>
            <div class="form-group">
              <label>设备指纹（必填）</label>
              <input
                v-model.trim="newDevice.device_fingerprint"
                type="text"
                class="form-input"
                placeholder="128位十六进制（sha512）"
              />
              <p class="form-hint">{{ $t('admin.deviceVerification.fingerprintHintAdd') }}</p>
              <p class="form-hint">指纹算法版本固定为 v3（不可手动修改）。</p>
            </div>
          </div>
          <div class="modal-footer">
            <button @click="closeAddModal" class="btn btn-secondary">
              <i class="fas fa-times"></i> {{ $t('common.cancel') }}
            </button>
            <button @click="addDevice" class="btn btn-primary" :disabled="!normalizeDeviceIdValue(newDevice.device_id) || !normalizeFingerprintValue(newDevice.device_fingerprint)">
              <i class="fas fa-plus"></i> {{ $t('admin.deviceVerification.addDevice') }}
            </button>
          </div>
        </div>
      </div>

      <!-- Edit Device Modal -->
      <div v-if="showEditModalVisible" class="modal-overlay" @click="closeEditModal">
        <div class="modal-container" @click.stop>
          <div class="modal-header">
            <i class="fas fa-edit"></i>
            <h3>{{ $t('admin.deviceVerification.editQuota') }}</h3>
          </div>
          <div class="modal-body">
            <div class="device-info-box">
              <div class="device-icon">
                <i class="fas fa-shield-alt"></i>
              </div>
              <div class="device-details">
                <p class="device-id-text"><strong>{{ editingDevice?.device_id }}</strong></p>
                <p class="device-stats-text">
                  <i class="fas fa-check-circle"></i>
                  {{ $t('admin.deviceVerification.currentCount') }}: {{ editingDevice?.verification_count }}
                </p>
                <p class="device-max-text">
                  <i class="fas fa-tachometer-alt"></i>
                  {{ $t('admin.deviceVerification.currentMax') }}: {{ editingDevice?.max_verifications }}
                </p>
                <p class="device-question-text" v-if="editingDevice?.question_name">
                  <i class="fas fa-book"></i>
                  {{ $t('admin.deviceVerification.currentQuestion') }}: {{ editingDevice?.question_name }}
                </p>
                <p class="device-question-text" v-if="editingDevice?.firmware_name">
                  <i class="fas fa-microchip"></i>
                  {{ $t('admin.deviceVerification.firmwareCurrent', { name: editingDevice?.firmware_name }) }}
                </p>
              </div>
            </div>
            <div class="form-group">
              <label>{{ $t('admin.deviceVerification.setNewMax') }}</label>
              <input
                v-model.number="editData.max_verifications"
                type="number"
                class="form-input"
                min="0"
                max="1000000"
              />
            </div>
            <div class="form-group">
              <label>{{ $t('admin.deviceVerification.addCount') }}</label>
              <input
                v-model.number="editData.add_count"
                type="number"
                class="form-input"
                min="0"
                max="1000000"
              />
              <p class="form-hint">{{ $t('admin.deviceVerification.addCountHint') }}</p>
            </div>
            <div class="form-group">
              <label>{{ $t('admin.deviceVerification.questionBank') }}</label>
              <select v-model="editData.question_id" class="form-input">
                <option value="">{{ $t('admin.deviceVerification.noQuestionBank') }}</option>
                <option v-for="q in questions" :key="q.id" :value="q.id">{{ q.name }}</option>
              </select>
              <p class="form-hint">{{ $t('admin.deviceVerification.questionBankHint') }}</p>
            </div>
            <div class="form-group">
              <label>{{ $t('admin.deviceVerification.firmwareVersion') }}</label>
              <select v-model="editData.firmware_id" class="form-input">
                <option value="">{{ $t('admin.deviceVerification.firmwareNone') }}</option>
                <option v-for="f in firmwareItems" :key="f.id" :value="f.id">{{ f.file_name }}{{ f.is_default ? $t('admin.deviceVerification.firmwareDefaultOptionSuffix') : '' }}</option>
              </select>
              <p class="form-hint">{{ $t('admin.deviceVerification.firmwareHintOverride') }}</p>
            </div>
            <div class="form-group">
              <label>设备指纹（必填）</label>
              <input
                v-model.trim="editData.device_fingerprint"
                type="text"
                class="form-input"
                placeholder="128位十六进制（sha512）"
              />
              <p class="form-hint">{{ $t('admin.deviceVerification.fingerprintHintEdit') }}</p>
              <p class="form-hint">指纹算法版本固定为 v3（不可手动修改）。</p>
            </div>
          </div>
          <div class="modal-footer">
            <button @click="closeEditModal" class="btn btn-secondary">
              <i class="fas fa-times"></i> {{ $t('common.cancel') }}
            </button>
            <button @click="updateDevice" class="btn btn-primary">
              <i class="fas fa-save"></i> {{ $t('common.save') }}
            </button>
          </div>
        </div>
      </div>

      <!-- Delete Confirmation Modal -->
      <div v-if="showDeleteModal" class="modal-overlay" @click="closeDeleteModal">
        <div class="modal-container" @click.stop>
          <div class="modal-header danger">
            <i class="fas fa-exclamation-triangle"></i>
            <h3>{{ $t('admin.deviceVerification.confirmDelete') }}</h3>
          </div>
          <div class="modal-body">
            <p>{{ $t('admin.deviceVerification.confirmDeleteText') }}</p>
            <div class="device-info-box">
              <div class="device-icon">
                <i class="fas fa-shield-alt"></i>
              </div>
              <div class="device-details">
                <p class="device-id-text"><strong>{{ deviceToDelete?.device_id }}</strong></p>
                <p class="device-stats-text">
                  <span class="badge badge-stats">
                    <i class="fas fa-check-circle"></i>
                    {{ deviceToDelete?.verification_count }} / {{ deviceToDelete?.max_verifications }}
                  </span>
                </p>
              </div>
            </div>
            <div class="warning-box">
              <i class="fas fa-exclamation-circle"></i>
              <div class="warning-content">
                <p><strong>{{ $t('admin.deviceVerification.actionCannotUndo') }}</strong></p>
                <ul>
                  <li>{{ $t('admin.deviceVerification.deleteWarning1') }}</li>
                  <li>{{ $t('admin.deviceVerification.deleteWarning2') }}</li>
                </ul>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button @click="closeDeleteModal" class="btn btn-secondary">
              <i class="fas fa-times"></i> {{ $t('common.cancel') }}
            </button>
            <button @click="executeDelete" class="btn btn-danger">
              <i class="fas fa-trash"></i> {{ $t('common.delete') }}
            </button>
          </div>
        </div>
      </div>

      <!-- Batch Delete Modal -->
      <div v-if="showBatchDeleteModal" class="modal-overlay" @click="closeBatchDeleteModal">
        <div class="modal-container" @click.stop>
          <div class="modal-header danger">
            <i class="fas fa-exclamation-triangle"></i>
            <h3>{{ $t('admin.deviceVerification.confirmBatchDeletion') }}</h3>
          </div>
          <div class="modal-body">
            <p>{{ $t('admin.deviceVerification.batchDeleteWarning', { count: selectedDevices.length }) }}</p>
            <div class="warning-box">
              <i class="fas fa-exclamation-circle"></i>
              <div class="warning-content">
                <p><strong>{{ $t('admin.deviceVerification.actionCannotUndo') }}</strong></p>
                <ul>
                  <li>{{ $t('admin.deviceVerification.deleteWarning1') }}</li>
                  <li>{{ $t('admin.deviceVerification.deleteWarning2') }}</li>
                </ul>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button @click="closeBatchDeleteModal" class="btn btn-secondary">
              <i class="fas fa-times"></i> {{ $t('common.cancel') }}
            </button>
            <button @click="executeBatchDelete" class="btn btn-danger">
              <i class="fas fa-trash"></i> {{ $t('admin.deviceVerification.deleteDevices', { count: selectedDevices.length }) }}
            </button>
          </div>
        </div>
      </div>

      <!-- Logs Modal -->
      <div v-if="showLogsModalVisible" class="modal-overlay" @click="closeLogsModal">
        <div class="modal-container modal-lg" @click.stop>
          <div class="modal-header">
            <i class="fas fa-history"></i>
            <h3>{{ $t('admin.deviceVerification.verificationLogs') }} - {{ logsDevice?.device_id }}</h3>
          </div>
          <div class="modal-body">
            <div v-if="logsLoading" class="loading-container">
              <div class="loading-spinner">
                <i class="fas fa-spinner fa-spin"></i>
                <span>{{ $t('admin.deviceVerification.loadingLogs') }}</span>
              </div>
            </div>
            <div v-else-if="logs.length === 0" class="empty-logs">
              <i class="fas fa-inbox"></i>
              <p>{{ $t('admin.deviceVerification.noLogs') }}</p>
            </div>
            <div v-else class="logs-table-wrapper">
              <div class="logs-stats">
                <span>{{ $t('admin.deviceVerification.totalLogs') }}: <strong>{{ logsTotal }}</strong></span>
              </div>
              <table class="logs-table">
                <thead>
                  <tr>
                    <th>{{ $t('admin.deviceVerification.logTime') }}</th>
                    <th>{{ $t('admin.deviceVerification.logSignature') }}</th>
                    <th>{{ $t('admin.deviceVerification.logIp') }}</th>
                    <th>{{ $t('admin.deviceVerification.logUserAgent') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="log in logs" :key="log.id">
                    <td>
                      <span class="log-time" :title="formatFullDate(log.created_at)">
                        {{ formatDateTime(log.created_at) }}
                      </span>
                    </td>
                    <td>
                      <span class="log-signature" :title="log.signature">
                        {{ log.signature?.substring(0, 20) }}...
                      </span>
                    </td>
                    <td>
                      <span class="log-ip">{{ log.ip_address || '-' }}</span>
                    </td>
                    <td>
                      <span class="log-ua" :title="log.user_agent">
                        {{ truncateUA(log.user_agent) }}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <div class="modal-footer">
            <button @click="closeLogsModal" class="btn btn-secondary">
              <i class="fas fa-times"></i> {{ $t('common.close') }}
            </button>
          </div>
        </div>
      </div>

      <!-- Toast Notification -->
      <div v-if="toast.visible" :class="['toast', toast.type]">
        <i :class="toast.type === 'success' ? 'fas fa-check-circle' : 'fas fa-exclamation-circle'"></i>
        <span>{{ toast.message }}</span>
      </div>

      <!-- 操作菜单挂到 body，避免被表格 overflow 裁切 -->
      <Teleport to="body">
        <div
          v-if="openActionMenuDevice"
          ref="actionMenuPanelRef"
          class="action-menu-panel action-menu-panel--fixed"
          :style="actionMenuPanelStyle"
          @click.stop
        >
          <button v-if="canManage" type="button" class="action-menu-item" @click="runDeviceAction(showLogsModal)">
            <i class="fas fa-history"></i>
            <span>{{ $t('admin.deviceVerification.logs') }}</span>
          </button>
          <button v-if="canManage" type="button" class="action-menu-item" @click="runDeviceAction(showEditModal)">
            <i class="fas fa-edit"></i>
            <span>{{ $t('admin.deviceVerification.edit') }}</span>
          </button>
          <button v-if="canManage" type="button" class="action-menu-item" @click="runDeviceAction(resetCount)">
            <i class="fas fa-redo"></i>
            <span>{{ $t('admin.deviceVerification.reset') }}</span>
          </button>
          <button
            v-if="canManage"
            type="button"
            class="action-menu-item"
            @click="runDeviceAction(toggleWhitelist)"
          >
            <i :class="Number(openActionMenuDevice.is_whitelisted) === 1 ? 'fas fa-toggle-off' : 'fas fa-toggle-on'"></i>
            <span>{{ Number(openActionMenuDevice.is_whitelisted) === 1 ? $t('admin.deviceVerification.disableDevice') : $t('admin.deviceVerification.enableDevice') }}</span>
          </button>
          <button v-if="canManage" type="button" class="action-menu-item danger" @click="runDeviceAction(confirmDelete)">
            <i class="fas fa-trash"></i>
            <span>{{ $t('admin.deviceVerification.delete') }}</span>
          </button>
        </div>
      </Teleport>
      </template>
    </div>
</template>

<script setup>
import AdminNoPermissionCard from '@/components/admin/AdminNoPermissionCard.vue'
import AdminCreatedByHeader from '@/components/admin/AdminCreatedByHeader.vue'
import AdminCreatedByCell from '@/components/admin/AdminCreatedByCell.vue'
import { useDeviceVerificationAdmin } from '@/composables/useDeviceVerificationAdmin'

const {
  canManage,
  canAccessPage,
  canManageGlobalSettings,
  isScopedAgent,
  devices,
  loading,
  selectAll,
  selectedDevices,
  questions,
  showAddModal,
  newDevice,
  showEditModalVisible,
  editingDevice,
  editData,
  showDeleteModal,
  deviceToDelete,
  showBatchDeleteModal,
  showLogsModalVisible,
  logsDevice,
  logs,
  logsTotal,
  logsLoading,
  cooldownHours,
  signingPrivateKeyInput,
  signingKeyConfigured,
  settingsSaving,
  signingKeySaving,
  toast,
  firmwareItems,
  firmwareLoading,
  openActionMenuDevice,
  actionMenuPanelRef,
  actionMenuPanelStyle,
  toggleActionMenu,
  closeActionMenu,
  runDeviceAction,
  saveCooldownSettings,
  scheduleSigningKeyAutoSave,
  normalizeDeviceIdValue,
  normalizeFingerprintValue,
  formatFingerprint,
  closeAddModal,
  addDevice,
  showEditModal,
  closeEditModal,
  updateDevice,
  toggleWhitelist,
  resetCount,
  showLogsModal,
  closeLogsModal,
  formatDateTime,
  truncateUA,
  confirmDelete,
  closeDeleteModal,
  executeDelete,
  confirmBatchDelete,
  closeBatchDeleteModal,
  executeBatchDelete,
  toggleSelectAll,
  getRemainingClass,
  formatDate,
  formatFullDate,
  showToast,
} = useDeviceVerificationAdmin()
</script>


<style scoped src="./device-verification-view.css"></style>
