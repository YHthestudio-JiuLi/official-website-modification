<template>
  <AdminLayout>
    <template #header-title>{{ $t('admin.deviceVerification.title') }}</template>

    <div class="device-page">
      <div class="top-panels">
        <!-- 防重复消耗：同一设备在设定秒数内重复 /api/device/verify 不增加验证次数 -->
        <div class="settings-card">
          <div class="settings-header">
            <h3>
              <i class="fas fa-clock"></i>
              {{ $t('admin.deviceVerification.cooldownTitle') }}
            </h3>
            <p class="settings-desc">{{ $t('admin.deviceVerification.cooldownHint') }}</p>
          </div>
          <div class="settings-row">
            <label class="settings-label">{{ $t('admin.deviceVerification.cooldownHours') }}</label>
            <input
              v-model.number="cooldownHours"
              type="number"
              min="0"
              max="8760"
              step="0.1"
              class="form-input cooldown-input"
            />
            <button type="button" class="btn btn-primary" :disabled="settingsSaving" @click="saveCooldownSettings">
              <i class="fas fa-save"></i>
              {{ settingsSaving ? $t('common.loading') : $t('common.save') }}
            </button>
          </div>
        </div>

        <div class="settings-card firmware-card">
          <div class="settings-header">
            <h3>
              <i class="fas fa-microchip"></i>
              {{ $t('admin.deviceVerification.firmwareTitle') }}
            </h3>
            <p class="settings-desc">{{ $t('admin.deviceVerification.firmwareDesc') }}</p>
          </div>
          <div class="firmware-toolbar">
            <input ref="firmwareInputRef" type="file" class="firmware-file-input" @change="onFirmwareFileChange" />
            <button type="button" class="btn btn-primary" :disabled="firmwareUploading" @click="triggerFirmwareSelect">
              <i class="fas fa-upload"></i>
              {{ firmwareUploading ? $t('admin.deviceVerification.firmwareUploading') : $t('admin.deviceVerification.firmwareUpload') }}
            </button>
          </div>
          <div v-if="firmwareLoading" class="firmware-empty">{{ $t('admin.deviceVerification.firmwareListLoading') }}</div>
          <div v-else-if="firmwareItems.length === 0" class="firmware-empty">{{ $t('admin.deviceVerification.firmwareEmpty') }}</div>
          <div v-else class="firmware-select-panel">
            <select v-model="selectedFirmwareId" class="form-input">
              <option disabled value="">{{ $t('admin.deviceVerification.firmwareSelectPlaceholder') }}</option>
              <option v-for="item in firmwareItems" :key="item.id" :value="String(item.id)">
                {{ item.file_name }}{{ item.is_default ? $t('admin.deviceVerification.firmwareDefaultOptionSuffix') : '' }}
              </option>
            </select>
            <div v-if="selectedFirmwareItem" class="firmware-sub">
              <span>{{ formatFirmwareSize(selectedFirmwareItem.file_size) }}</span>
              <span>·</span>
              <span>{{ formatDateTime(selectedFirmwareItem.created_at) }}</span>
              <span v-if="selectedFirmwareItem.is_default" class="firmware-default-badge">{{ $t('admin.deviceVerification.firmwareDefaultBadge') }}</span>
            </div>
            <div class="firmware-actions">
              <button
                type="button"
                class="action-btn btn-reset"
                :disabled="!selectedFirmwareItem || selectedFirmwareItem.is_default"
                @click="setDefaultFirmware"
              >
                <i class="fas fa-thumbtack"></i>
                <span class="action-text">{{ $t('admin.deviceVerification.firmwareSetDefault') }}</span>
              </button>
              <button
                type="button"
                class="action-btn btn-delete"
                :disabled="!selectedFirmwareItem"
                @click="deleteFirmware"
              >
                <i class="fas fa-trash"></i>
                <span class="action-text">{{ $t('common.delete') }}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="page-header">
        <div class="header-content">
          <h2>
            <i class="fas fa-shield-alt"></i>
            {{ $t('admin.deviceVerification.title') }}
          </h2>
          <p>{{ $t('admin.deviceVerification.description') }}</p>
        </div>
        <div class="header-actions">
          <button @click="showAddModal = true" class="btn btn-primary">
            <i class="fas fa-plus"></i>
            <span>{{ $t('admin.deviceVerification.addDevice') }}</span>
          </button>
          <button
            v-if="selectedDevices.length > 0"
            @click="confirmBatchDelete"
            class="btn btn-danger"
          >
            <i class="fas fa-trash"></i>
            <span>{{ $t('admin.deviceVerification.deleteSelected') }} ({{ selectedDevices.length }})</span>
            <!-- <span class="count-badge-btn"></span> -->
          </button>
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
                <th>白名单</th>
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
                    {{ Number(device.is_whitelisted) === 1 ? '已授权' : '未授权' }}
                  </span>
                </td>
                <td>
                  <span class="date-cell" :title="formatFullDate(device.created_at)">{{ formatDate(device.created_at) }}</span>
                </td>
                <td class="actions-cell">
                  <div class="action-group" role="group">
                    <button
                      @click="showKeysModal(device)"
                      class="action-btn btn-keys"
                      :title="$t('admin.deviceVerification.viewKeys')"
                    >
                      <i class="fas fa-key"></i>
                      <span class="action-text">{{ $t('admin.deviceVerification.keys') }}</span>
                    </button>
                    <button
                      @click="showLogsModal(device)"
                      class="action-btn btn-logs"
                      :title="$t('admin.deviceVerification.viewLogs')"
                    >
                      <i class="fas fa-history"></i>
                      <span class="action-text">{{ $t('admin.deviceVerification.logs') }}</span>
                    </button>
                    <button
                      @click="showEditModal(device)"
                      class="action-btn btn-edit"
                      :title="$t('admin.deviceVerification.editQuota')"
                    >
                      <i class="fas fa-edit"></i>
                      <span class="action-text">{{ $t('admin.deviceVerification.edit') }}</span>
                    </button>
                    <button
                      @click="resetCount(device)"
                      class="action-btn btn-reset"
                      :title="$t('admin.deviceVerification.resetCount')"
                    >
                      <i class="fas fa-redo"></i>
                      <span class="action-text">{{ $t('admin.deviceVerification.reset') }}</span>
                    </button>
                    <button
                      @click="toggleWhitelist(device)"
                      :class="['action-btn', Number(device.is_whitelisted) === 1 ? 'btn-delete' : 'btn-edit']"
                      :title="Number(device.is_whitelisted) === 1 ? '取消白名单授权' : '加入白名单授权'"
                    >
                      <i :class="Number(device.is_whitelisted) === 1 ? 'fas fa-user-slash' : 'fas fa-user-check'"></i>
                      <span class="action-text">{{ Number(device.is_whitelisted) === 1 ? '取消授权' : '授权' }}</span>
                    </button>
                    <button
                      @click="confirmDelete(device)"
                      class="action-btn btn-delete"
                      :title="$t('admin.deviceVerification.delete')"
                    >
                      <i class="fas fa-trash"></i>
                      <span class="action-text">{{ $t('admin.deviceVerification.delete') }}</span>
                    </button>
                  </div>
                </td>
              </tr>
              <tr v-if="devices.length === 0">
                <td colspan="11" class="empty-state">
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
          </div>
          <div class="modal-footer">
            <button @click="closeAddModal" class="btn btn-secondary">
              <i class="fas fa-times"></i> {{ $t('common.cancel') }}
            </button>
            <button @click="addDevice" class="btn btn-primary" :disabled="!newDevice.device_id">
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

      <!-- Keys Modal -->
      <div v-if="showKeysModalVisible" class="modal-overlay" @click="closeKeysModal">
        <div class="modal-container" @click.stop>
          <div class="modal-header">
            <i class="fas fa-key"></i>
            <h3>{{ $t('admin.deviceVerification.deviceKeys') }} - {{ keysDevice?.device_id }}</h3>
          </div>
          <div class="modal-body">
            <div v-if="keysLoading" class="loading-container">
              <div class="loading-spinner">
                <i class="fas fa-spinner fa-spin"></i>
                <span>{{ $t('admin.deviceVerification.loadingKeys') }}</span>
              </div>
            </div>
            <div v-else>
              <div class="key-section">
                <div class="key-header">
                  <label>{{ $t('admin.deviceVerification.publicKey') }}</label>
                  <button @click="copyKey(keys.public_key)" class="copy-btn">
                    <i class="fas fa-copy"></i>
                  </button>
                </div>
                <div class="key-value">{{ keys.public_key }}</div>
              </div>
              <div class="key-section">
                <div class="key-header">
                  <label>{{ $t('admin.deviceVerification.privateKey') }}</label>
                  <button @click="copyKey(keys.private_key)" class="copy-btn">
                    <i class="fas fa-copy"></i>
                  </button>
                </div>
                <div class="key-value key-private">{{ keys.private_key }}</div>
                <p class="key-warning">
                  <i class="fas fa-exclamation-triangle"></i>
                  {{ $t('admin.deviceVerification.privateKeyWarning') }}
                </p>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button @click="closeKeysModal" class="btn btn-secondary">
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
    </div>
  </AdminLayout>
</template>

<script setup>
import { ref, onMounted, watch, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import api from '@/services/api'
import AdminLayout from '@/components/admin/AdminLayout.vue'

const { t } = useI18n()

const devices = ref([])
const loading = ref(true)
const selectAll = ref(false)
const selectedDevices = ref([])
const questions = ref([])

const showAddModal = ref(false)
const newDevice = ref({
  device_id: '',
  max_verifications: 10,
  question_id: '',
  firmware_id: ''
})

const showEditModalVisible = ref(false)
const editingDevice = ref(null)
const editData = ref({
  max_verifications: null,
  add_count: 0,
  question_id: '',
  firmware_id: ''
})

const showDeleteModal = ref(false)
const deviceToDelete = ref(null)

const showBatchDeleteModal = ref(false)

const showLogsModalVisible = ref(false)
const logsDevice = ref(null)
const logs = ref([])
const logsTotal = ref(0)
const logsLoading = ref(false)

const showKeysModalVisible = ref(false)
const keysDevice = ref(null)
const keys = ref({ public_key: '', private_key: '' })
const keysLoading = ref(false)

const toast = ref({
  visible: false,
  type: 'success',
  message: ''
})

// 全局：多少秒内重复验证不消耗次数（秒，0=关闭）
const cooldownHours = ref(0)
const settingsSaving = ref(false)
const firmwareItems = ref([])
const firmwareLoading = ref(false)
const firmwareUploading = ref(false)
const firmwareInputRef = ref(null)
const selectedFirmwareId = ref('')
const selectedFirmwareItem = computed(() => firmwareItems.value.find(item => String(item.id) === selectedFirmwareId.value) || null)

onMounted(async () => {
  await Promise.all([fetchCooldownSettings(), fetchDevices(), fetchQuestions(), fetchFirmwareItems()])
})

async function fetchQuestions() {
  try {
    const response = await api.get('/api/admin/questions')
    questions.value = response.data || []
  } catch (error) {
    console.error('Failed to fetch questions:', error)
  }
}

async function fetchCooldownSettings() {
  try {
    const response = await api.get('/api/admin/device-verification/settings')
    const sec = response.data?.verify_cooldown_seconds
    const secNum = typeof sec === 'number' ? sec : parseInt(sec, 10) || 0
    cooldownHours.value = Number((secNum / 3600).toFixed(2))
  } catch (error) {
    showToast(t('admin.deviceVerification.loadSettingsError'), 'error')
  }
}

async function saveCooldownSettings() {
  const hours = parseFloat(cooldownHours.value)
  if (Number.isNaN(hours) || hours < 0 || hours > 8760) {
    showToast(t('admin.deviceVerification.cooldownInvalid'), 'error')
    return
  }
  const sec = Math.round(hours * 3600)
  settingsSaving.value = true
  try {
    await api.put('/api/admin/device-verification/settings', {
      verify_cooldown_seconds: sec
    })
    await fetchCooldownSettings()
    showToast(t('admin.deviceVerification.cooldownSaved'), 'success')
  } catch (error) {
    showToast(error.response?.data?.error || t('admin.deviceVerification.cooldownSaveError'), 'error')
  } finally {
    settingsSaving.value = false
  }
}

async function fetchFirmwareItems() {
  firmwareLoading.value = true
  try {
    const response = await api.get('/api/admin/device-firmwares')
    firmwareItems.value = response.data.items || []
    if (firmwareItems.value.length === 0) {
      selectedFirmwareId.value = ''
    } else if (!firmwareItems.value.some(item => String(item.id) === selectedFirmwareId.value)) {
      const defaultItem = firmwareItems.value.find(item => item.is_default)
      selectedFirmwareId.value = defaultItem ? String(defaultItem.id) : String(firmwareItems.value[0].id)
    }
  } catch (error) {
    showToast(error.response?.data?.error || t('admin.deviceVerification.firmwareLoadListError'), 'error')
  } finally {
    firmwareLoading.value = false
  }
}

function triggerFirmwareSelect() {
  firmwareInputRef.value?.click()
}

async function onFirmwareFileChange(event) {
  const file = event.target?.files?.[0]
  if (!file) return
  const formData = new FormData()
  formData.append('firmware', file)
  firmwareUploading.value = true
  try {
    const response = await api.post('/api/admin/device-firmwares/upload', formData)
    const createdId = response.data?.firmware?.id
    await fetchFirmwareItems()
    if (createdId) {
      selectedFirmwareId.value = String(createdId)
    }
    showToast(t('admin.deviceVerification.firmwareUploadSuccess'), 'success')
  } catch (error) {
    showToast(error.response?.data?.error || t('admin.deviceVerification.firmwareUploadError'), 'error')
  } finally {
    firmwareUploading.value = false
    if (firmwareInputRef.value) {
      firmwareInputRef.value.value = ''
    }
  }
}

async function setDefaultFirmware() {
  if (!selectedFirmwareItem.value || selectedFirmwareItem.value.is_default) return
  try {
    await api.put(`/api/admin/device-firmwares/${selectedFirmwareItem.value.id}/default`)
    await Promise.all([fetchFirmwareItems(), fetchDevices()])
    showToast(t('admin.deviceVerification.firmwareDefaultUpdated'), 'success')
  } catch (error) {
    showToast(error.response?.data?.error || t('admin.deviceVerification.firmwareSetDefaultError'), 'error')
  }
}

async function deleteFirmware() {
  if (!selectedFirmwareItem.value) return
  const ok = window.confirm(
    t('admin.deviceVerification.firmwareDeleteConfirm', { name: selectedFirmwareItem.value.file_name })
  )
  if (!ok) return
  try {
    await api.delete(`/api/admin/device-firmwares/${selectedFirmwareItem.value.id}`)
    await Promise.all([fetchFirmwareItems(), fetchDevices()])
    showToast(t('admin.deviceVerification.firmwareDeleteSuccess'), 'success')
  } catch (error) {
    showToast(error.response?.data?.error || t('admin.deviceVerification.firmwareDeleteError'), 'error')
  }
}

async function fetchDevices() {
  loading.value = true
  try {
    const response = await api.get('/api/admin/devices')
    devices.value = response.data.devices || []
  } catch (error) {
    showToast(t('admin.deviceVerification.loadError'), 'error')
  } finally {
    loading.value = false
  }
}

function closeAddModal() {
  showAddModal.value = false
  newDevice.value = { device_id: '', max_verifications: 10, question_id: '', firmware_id: '' }
}

async function addDevice() {
  if (!newDevice.value.device_id.trim()) return
  
  try {
    const questionId = newDevice.value.question_id ? parseInt(newDevice.value.question_id) : null
    const firmwareId = newDevice.value.firmware_id ? parseInt(newDevice.value.firmware_id) : null
    await api.post('/api/admin/devices', {
      device_id: newDevice.value.device_id.trim(),
      max_verifications: newDevice.value.max_verifications,
      question_id: questionId,
      firmware_id: firmwareId,
      // 手动添加的设备默认已授权；未授权场景由列表「授权」按钮处理
      is_whitelisted: true
    })
    closeAddModal()
    await fetchDevices()
    showToast(t('admin.deviceVerification.addSuccess'), 'success')
  } catch (error) {
    showToast(error.response?.data?.error || t('admin.deviceVerification.addError'), 'error')
  }
}

function showEditModal(device) {
  editingDevice.value = device
  editData.value = {
    max_verifications: device.max_verifications,
    add_count: 0,
    question_id: device.question_id || '',
    firmware_id: device.firmware_id || ''
  }
  showEditModalVisible.value = true
}

function closeEditModal() {
  showEditModalVisible.value = false
  editingDevice.value = null
}

async function updateDevice() {
  if (!editingDevice.value) return
  
  try {
    const payload = {}
    if (editData.value.max_verifications !== editingDevice.value.max_verifications) {
      payload.max_verifications = editData.value.max_verifications
    }
    if (editData.value.add_count > 0) {
      payload.add_max_verifications = editData.value.add_count
    }
    const editQuestionId = editData.value.question_id ? parseInt(editData.value.question_id) : null
    const deviceQuestionId = editingDevice.value.question_id
    if (editQuestionId !== deviceQuestionId) {
      payload.question_id = editQuestionId
    }
    const editFirmwareId = editData.value.firmware_id ? parseInt(editData.value.firmware_id) : null
    const deviceFirmwareId = editingDevice.value.firmware_id || null
    if (editFirmwareId !== deviceFirmwareId) {
      payload.firmware_id = editFirmwareId
    }
    if (Object.keys(payload).length === 0) {
      closeEditModal()
      return
    }
    
    await api.put(`/api/admin/devices/${editingDevice.value.device_id}`, payload)
    closeEditModal()
    await fetchDevices()
    showToast(t('admin.deviceVerification.updateSuccess'), 'success')
  } catch (error) {
    showToast(error.response?.data?.error || t('admin.deviceVerification.updateError'), 'error')
  }
}

async function toggleWhitelist(device) {
  const current = Number(device.is_whitelisted || 0) === 1
  try {
    await api.put(`/api/admin/devices/${device.device_id}`, {
      is_whitelisted: !current
    })
    await fetchDevices()
    showToast(!current ? '设备已加入白名单，可正常验证' : '设备已移出白名单，将拒绝验证', 'success')
  } catch (error) {
    showToast(error.response?.data?.error || '更新白名单失败', 'error')
  }
}

async function resetCount(device) {
  try {
    await api.post(`/api/admin/devices/${device.device_id}/reset-count`)
    await fetchDevices()
    showToast(t('admin.deviceVerification.resetSuccess'), 'success')
  } catch (error) {
    showToast(error.response?.data?.error || t('admin.deviceVerification.resetError'), 'error')
  }
}

async function showLogsModal(device) {
  logsDevice.value = device
  logs.value = []
  logsTotal.value = 0
  showLogsModalVisible.value = true
  await fetchLogs()
}

function closeLogsModal() {
  showLogsModalVisible.value = false
  logsDevice.value = null
  logs.value = []
  logsTotal.value = 0
}

async function showKeysModal(device) {
  keysDevice.value = device
  keys.value = { public_key: '', private_key: '' }
  showKeysModalVisible.value = true
  await fetchKeys()
}

function closeKeysModal() {
  showKeysModalVisible.value = false
  keysDevice.value = null
  keys.value = { public_key: '', private_key: '' }
}

async function fetchKeys() {
  if (!keysDevice.value) return
  keysLoading.value = true
  try {
    const response = await api.get(`/api/admin/devices/${keysDevice.value.device_id}/keys`)
    keys.value = {
      public_key: response.data.public_key || '',
      private_key: response.data.private_key || ''
    }
  } catch (error) {
    showToast(t('admin.deviceVerification.loadKeysError'), 'error')
  } finally {
    keysLoading.value = false
  }
}

function copyKey(key) {
  if (!key) return
  navigator.clipboard.writeText(key).then(() => {
    showToast(t('admin.deviceVerification.keyCopied'), 'success')
  }).catch(() => {
    showToast(t('admin.deviceVerification.copyFailed'), 'error')
  })
}

async function fetchLogs() {
  if (!logsDevice.value) return
  logsLoading.value = true
  try {
    const response = await api.get(`/api/admin/devices/${logsDevice.value.device_id}/logs`)
    logs.value = response.data.logs || []
    logsTotal.value = response.data.total || 0
  } catch (error) {
    showToast(t('admin.deviceVerification.loadLogsError'), 'error')
  } finally {
    logsLoading.value = false
  }
}

function formatDateTime(dateStr) {
  if (!dateStr) return '-'
  const parsed = parseServerDate(dateStr)
  if (!parsed) return dateStr
  return parsed.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

function truncateUA(ua) {
  if (!ua) return '-'
  if (ua.length <= 50) return ua
  return ua.substring(0, 50) + '...'
}

function confirmDelete(device) {
  deviceToDelete.value = device
  showDeleteModal.value = true
}

function closeDeleteModal() {
  showDeleteModal.value = false
  deviceToDelete.value = null
}

async function executeDelete() {
  if (!deviceToDelete.value) return
  
  try {
    await api.delete(`/api/admin/devices/${deviceToDelete.value.device_id}`)
    closeDeleteModal()
    await fetchDevices()
    showToast(t('admin.deviceVerification.deleteSuccess'), 'success')
  } catch (error) {
    showToast(error.response?.data?.error || t('admin.deviceVerification.deleteError'), 'error')
  }
}

function confirmBatchDelete() {
  if (selectedDevices.value.length === 0) return
  showBatchDeleteModal.value = true
}

function closeBatchDeleteModal() {
  showBatchDeleteModal.value = false
}

async function executeBatchDelete() {
  const selectedIds = [...selectedDevices.value]
  if (selectedIds.length === 0) return
  
  try {
    const promises = selectedIds.map(id => {
      const device = devices.value.find(d => d.id === id)
      return api.delete(`/api/admin/devices/${device.device_id}`)
    })
    await Promise.all(promises)
    
    closeBatchDeleteModal()
    selectedDevices.value = []
    await fetchDevices()
    showToast(t('admin.deviceVerification.batchDeleteSuccess', { count: selectedIds.length }), 'success')
  } catch (error) {
    showToast(error.response?.data?.error || t('admin.deviceVerification.deleteError'), 'error')
  }
}

watch(selectedDevices, (newVal) => {
  selectAll.value = newVal.length > 0 && devices.value.every(d => newVal.includes(d.id))
}, { deep: true })

function toggleSelectAll() {
  if (selectAll.value) {
    selectedDevices.value = devices.value.map(d => d.id)
  } else {
    selectedDevices.value = []
  }
}

function getRemainingClass(device) {
  const remaining = device.max_verifications - device.verification_count
  if (remaining <= 0) return 'remaining-zero'
  if (remaining <= 5) return 'remaining-low'
  return 'remaining-ok'
}

function formatDate(dateStr) {
  if (!dateStr) return '-'
  const parsed = parseServerDate(dateStr)
  if (!parsed) return dateStr
  return parsed.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

function formatFullDate(dateStr) {
  if (!dateStr) return '-'
  const parsed = parseServerDate(dateStr)
  if (!parsed) return dateStr
  return parsed.toLocaleString('en-US')
}

function parseServerDate(dateStr) {
  if (typeof dateStr !== 'string') return null
  const raw = dateStr.trim()
  if (!raw) return null

  // 兼容 SQLite 的 "YYYY-MM-DD HH:MM:SS"（默认 UTC）与 ISO 格式
  const hasTimezone = /[zZ]$|[+-]\d{2}:\d{2}$/.test(raw)
  const isoLike = raw.replace(' ', 'T')
  const normalized = hasTimezone ? isoLike : `${isoLike}Z`
  const d = new Date(normalized)
  return Number.isNaN(d.getTime()) ? null : d
}

function formatFirmwareSize(size) {
  const n = Number(size || 0)
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function showToast(message, type = 'success') {
  toast.value = { visible: true, type, message }
  setTimeout(() => {
    toast.value.visible = false
  }, 4000)
}
</script>

<style scoped>
.device-page {
  animation: fadeIn 0.5s ease;
  position: relative;
}

.top-panels {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1.5rem;
  margin-bottom: 1.5rem;
}

.settings-card {
  background: var(--bg-card);
  border-radius: 12px;
  border: 1px solid var(--border-color);
  padding: 1.25rem 1.5rem;
}

.firmware-card {
  min-height: 100%;
}

.firmware-toolbar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}

.firmware-file-input {
  display: none;
}

.firmware-empty {
  font-size: 0.9rem;
  color: var(--text-secondary);
  padding: 0.75rem 0;
}

.firmware-select-panel {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.firmware-default-badge {
  padding: 0.15rem 0.45rem;
  border-radius: 999px;
  font-size: 0.72rem;
  background: rgba(67, 233, 123, 0.16);
  color: #43e97b;
}

.firmware-sub {
  margin-top: 0.25rem;
  display: flex;
  align-items: center;
  gap: 0.45rem;
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.firmware-actions {
  display: flex;
  align-items: center;
  gap: 0.45rem;
}

.settings-header h3 {
  margin: 0 0 0.5rem 0;
  font-size: 1.1rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--text-primary);
}

.settings-desc {
  margin: 0 0 1rem 0;
  font-size: 0.9rem;
  color: var(--text-secondary);
}

.settings-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem 1rem;
}

.settings-label {
  font-size: 0.9rem;
  color: var(--text-secondary);
  min-width: 6rem;
}

.cooldown-input {
  max-width: 160px;
  padding: 0.6rem 0.75rem;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-darker);
  color: var(--text-primary);
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

.header-actions .btn,
.header-actions a.btn,
.header-actions button.btn {
  /* 1. 强制消除内外边距差异 */
  margin: 0 !important; 
  padding: 0 1.2rem !important;

  /* 2. 布局核心 */
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  vertical-align: middle; /* 解决行内对齐导致的视觉错位 */
  
  /* 3. 尺寸控制 */
  height: 40px !important;
  min-width: 120px;
  box-sizing: border-box !important; /* 确保 padding 不撑开高度 */

  /* 4. 文字处理 */
  line-height: 1; /* 已经设置了 flex 居中，line-height 设为 1 最保险 */
  font-size: 0.9rem;
  font-weight: 500;
  
  /* 其他样式 */
  gap: 0.5rem;
  border-radius: 8px;
  border: none !important;
  cursor: pointer;
  text-decoration: none;
  transition: all 0.3s ease;
  overflow: hidden; /* 防止内容溢出撑大高度 */
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
  display: flex;
  justify-content: space-between;
  align-items: center;
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

.data-table {
  width: 100%;
  min-width: 1050px;
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

@media (max-width: 1200px) {
  .scroll-indicator {
    display: flex;
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

.data-table tbody tr.selected-row {
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

.device-id-cell {
  font-family: monospace;
  font-size: 0.9rem;
  color: var(--text-primary);
}

.count-badge {
  display: inline-block;
  padding: 0.25rem 0.5rem;
  background: rgba(0, 212, 255, 0.1);
  color: var(--primary-color);
  border-radius: 4px;
  font-weight: 500;
  font-size: 0.85rem;
}

.max-badge {
  display: inline-block;
  padding: 0.25rem 0.5rem;
  background: rgba(67, 233, 123, 0.1);
  color: #43e97b;
  border-radius: 4px;
  font-weight: 500;
  font-size: 0.85rem;
}

.remaining-badge {
  display: inline-block;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-weight: 500;
  font-size: 0.85rem;
}

.remaining-ok {
  background: rgba(67, 233, 123, 0.1);
  color: #43e97b;
}

.remaining-low {
  background: rgba(255, 193, 7, 0.1);
  color: #ffc107;
}

.remaining-zero {
  background: rgba(245, 87, 108, 0.1);
  color: #f5576c;
}

.date-cell {
  font-size: 0.9rem;
  white-space: nowrap;
}

.question-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.35rem 0.75rem;
  background: linear-gradient(135deg, rgba(100, 108, 255, 0.2), rgba(160, 120, 255, 0.15));
  color: #646cff;
  border-radius: 6px;
  font-size: 0.85rem;
  font-weight: 500;
  border: 1px solid rgba(100, 108, 255, 0.3);
  transition: all 0.2s ease;
}

.question-badge:hover {
  background: linear-gradient(135deg, rgba(100, 108, 255, 0.3), rgba(160, 120, 255, 0.25));
  transform: translateY(-1px);
}

.question-badge i {
  font-size: 0.8rem;
  opacity: 0.8;
}

.question-name-text {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.no-question-badge {
  color: var(--text-secondary);
  font-size: 0.9rem;
  opacity: 0.5;
}

.firmware-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.3rem 0.65rem;
  border-radius: 6px;
  border: 1px solid rgba(0, 212, 255, 0.25);
  background: rgba(0, 212, 255, 0.1);
  color: var(--primary-color);
  font-size: 0.82rem;
}

.device-question-text {
  margin: 0 0 0.5rem 0;
  color: #646cff;
  font-size: 0.9rem;
  display: flex;
  align-items: center;
  gap: 0.4rem;
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
  min-width: 60px;
  height: 36px;
  padding: 0 0.75rem;
  border-radius: 6px;
  border: none;
  cursor: pointer;
  transition: all 0.3s ease;
  font-size: 0.85rem;
  font-weight: 500;
}

.action-btn i {
  font-size: 0.9rem;
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

.btn-reset {
  background: rgba(255, 193, 7, 0.15);
  color: #ffc107;
}

.btn-reset:hover {
  background: #ffc107;
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

.btn-logs {
  background: rgba(100, 108, 255, 0.15);
  color: #646cff;
}

.btn-logs:hover {
  background: #646cff;
  color: white;
}

.btn-keys {
  background: rgba(160, 120, 255, 0.15);
  color: #a078ff;
}

.btn-keys:hover {
  background: #a078ff;
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

.modal-header i {
  color: var(--primary-color);
  font-size: 1.5rem;
}

.modal-header.danger i {
  color: #ffc107;
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

.form-group {
  margin-bottom: 1.5rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.5rem;
  color: var(--text-primary);
  font-weight: 500;
}

.form-input {
  width: 100%;
  padding: 0.75rem 1rem;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-darker);
  color: var(--text-primary);
  font-size: 1rem;
  transition: all 0.3s ease;
}

.form-input:focus {
  outline: none;
  border-color: var(--primary-color);
  box-shadow: 0 0 0 3px rgba(0, 212, 255, 0.1);
}

select.form-input {
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%239a9db4' d='M6 8L2 4h8z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 1rem center;
  padding-right: 2.5rem;
  cursor: pointer;
}

select.form-input:hover {
  border-color: var(--primary-color);
  background-color: rgba(0, 212, 255, 0.05);
}

select.form-input option {
  background: var(--bg-card);
  color: var(--text-primary);
  padding: 0.75rem 1rem;
}

select.form-input option:hover {
  background: rgba(0, 212, 255, 0.1);
}

select.form-input option:checked {
  background: rgba(0, 212, 255, 0.15);
  color: var(--primary-color);
}

.form-hint {
  margin: 0.5rem 0 0;
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.device-info-box {
  display: flex;
  gap: 1rem;
  padding: 1rem;
  background: rgba(0, 212, 255, 0.05);
  border: 1px solid var(--primary-color);
  border-radius: 8px;
  margin: 1rem 0;
}

.device-icon {
  width: 60px;
  height: 60px;
  border-radius: 12px;
  background: var(--gradient-3);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 1.5rem;
  flex-shrink: 0;
}

.device-details {
  flex: 1;
}

.device-id-text {
  margin: 0 0 0.5rem 0;
  color: var(--text-primary);
  font-size: 1.1rem;
}

.device-stats-text,
.device-max-text {
  margin: 0 0 0.5rem 0;
  color: var(--text-secondary);
  font-size: 0.9rem;
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.badge {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.35rem 0.75rem;
  border-radius: 6px;
  font-size: 0.8rem;
  font-weight: 500;
}

.badge-stats {
  background: rgba(0, 212, 255, 0.15);
  color: var(--primary-color);
}

.key-section {
  margin-bottom: 1.5rem;
}

.key-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.key-header label {
  color: var(--text-primary);
  font-weight: 500;
  font-size: 0.9rem;
}

.copy-btn {
  background: rgba(0, 212, 255, 0.15);
  border: none;
  border-radius: 4px;
  padding: 0.35rem 0.6rem;
  color: var(--primary-color);
  cursor: pointer;
  transition: all 0.2s ease;
}

.copy-btn:hover {
  background: var(--primary-color);
  color: white;
}

.key-value {
  font-family: monospace;
  font-size: 0.8rem;
  background: var(--bg-darker);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 0.75rem;
  word-break: break-all;
  color: var(--text-secondary);
  line-height: 1.5;
}

.key-private {
  border-color: #f5576c;
  background: rgba(245, 87, 108, 0.05);
}

.key-warning {
  margin: 0.5rem 0 0;
  font-size: 0.8rem;
  color: #f5576c;
  display: flex;
  align-items: center;
  gap: 0.5rem;
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

.modal-lg {
  max-width: 800px;
}

.logs-table-wrapper {
  overflow-x: auto;
}

.logs-stats {
  padding: 0.75rem 0;
  color: var(--text-secondary);
  font-size: 0.9rem;
}

.logs-stats strong {
  color: var(--primary-color);
}

.logs-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}

.logs-table th {
  padding: 0.75rem;
  text-align: left;
  background: var(--bg-darker);
  color: var(--text-primary);
  font-weight: 600;
  border-bottom: 1px solid var(--border-color);
}

.logs-table td {
  padding: 0.75rem;
  border-bottom: 1px solid var(--border-color);
  color: var(--text-secondary);
  vertical-align: middle;
}

.logs-table tbody tr:hover {
  background: rgba(0, 212, 255, 0.05);
}

.log-time {
  font-family: monospace;
  font-size: 0.85rem;
  white-space: nowrap;
}

.log-signature {
  font-family: monospace;
  font-size: 0.8rem;
  color: var(--primary-color);
}

.log-ip {
  font-family: monospace;
  font-size: 0.85rem;
}

.log-ua {
  font-size: 0.8rem;
  color: var(--text-secondary);
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: inline-block;
}

.empty-logs {
  text-align: center;
  padding: 3rem;
  color: var(--text-secondary);
}

.empty-logs i {
  font-size: 3rem;
  margin-bottom: 1rem;
  opacity: 0.5;
}

.empty-logs p {
  margin: 0;
}

/* Toast */
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
  .top-panels {
    grid-template-columns: 1fr;
  }

  .page-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .btn {
    width: 100%;
    justify-content: center;
  }

  .device-info-box {
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
}
</style>