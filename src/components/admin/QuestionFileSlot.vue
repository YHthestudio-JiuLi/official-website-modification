<template>
  <div class="form-group">
    <label>
      <i :class="iconClass"></i> {{ label }}
    </label>

    <div v-if="mode === 'readonly' && existingFile" class="file-preview-card readonly">
      <div class="file-icon">
        <i :class="iconClass"></i>
      </div>
      <div class="file-info">
        <p class="file-name">{{ fileName }}</p>
        <p class="file-status existing">
          <i class="fas fa-check-circle"></i>
          {{ $t('admin.questionsForm.currentFile') }}
        </p>
        <p v-if="existingFileSize" class="file-size">{{ formatFileSize(existingFileSize) }}</p>
      </div>
    </div>

    <div v-else class="upload-area">
      <input
        type="file"
        :id="inputId"
        :ref="setInputRef"
        :accept="accept"
        @change="onFileSelect"
        style="display: none"
      />

      <div
        v-if="!pendingFile && !showExistingCard"
        class="upload-box"
        @click="triggerSelect"
      >
        <i class="fas fa-cloud-upload-alt"></i>
        <p class="upload-text">{{ uploadText }}</p>
        <p class="upload-hint">{{ uploadHint }}</p>
      </div>

      <div v-if="showExistingCard" class="file-preview-card">
        <div class="file-icon">
          <i :class="iconClass"></i>
        </div>
        <div class="file-info">
          <p class="file-name">{{ fileName }}</p>
          <p class="file-status existing">
            <i class="fas fa-check-circle"></i>
            {{ $t('admin.questionsForm.currentFile') }}
          </p>
          <p v-if="existingFileSize" class="file-size">{{ formatFileSize(existingFileSize) }}</p>
        </div>
        <div v-if="mode === 'editable'" class="file-actions">
          <button type="button" class="btn-file btn-replace" @click="triggerSelect">
            <i class="fas fa-exchange-alt"></i> {{ $t('admin.questionsForm.replace') }}
          </button>
          <button type="button" class="btn-file btn-remove" @click="emit('clear-existing')">
            <i class="fas fa-times"></i> {{ $t('admin.questionsForm.remove') }}
          </button>
        </div>
      </div>

      <div v-if="pendingFile" class="file-preview-card new">
        <div class="file-icon">
          <i :class="iconClass"></i>
        </div>
        <div class="file-info">
          <p class="file-name">{{ pendingFile.name }}</p>
          <p class="file-status new">
            <i class="fas fa-clock"></i> {{ $t('admin.questionsForm.pendingUpload') }}
          </p>
          <p class="file-size">{{ formatFileSize(pendingFile.size) }}</p>
        </div>
        <div class="file-actions">
          <button type="button" class="btn-file btn-remove" @click="emit('clear-pending')">
            <i class="fas fa-times"></i> {{ $t('admin.questionsForm.cancelPending') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  label: { type: String, required: true },
  iconClass: { type: String, required: true },
  accept: { type: String, required: true },
  uploadText: { type: String, required: true },
  uploadHint: { type: String, required: true },
  inputId: { type: String, required: true },
  /** editable | readonly | add-only */
  mode: {
    type: String,
    required: true,
    validator: (v) => ['editable', 'readonly', 'add-only'].includes(v),
  },
  existingFile: { type: String, default: null },
  existingFileSize: { type: Number, default: null },
  pendingFile: { type: Object, default: null },
  cleared: { type: Boolean, default: false },
  formatFileSize: { type: Function, required: true },
  getFileName: { type: Function, required: true },
})

const emit = defineEmits(['select', 'clear-existing', 'clear-pending'])

const inputEl = ref(null)

function setInputRef(el) {
  inputEl.value = el
}

const showExistingCard = computed(() => {
  return Boolean(props.existingFile && !props.pendingFile && !props.cleared && props.mode !== 'add-only')
})

const fileName = computed(() => props.getFileName(props.existingFile))

function triggerSelect() {
  inputEl.value?.click()
}

function onFileSelect(event) {
  const file = event.target.files?.[0]
  if (file) {
    emit('select', file)
  }
}
</script>

<style scoped>
.form-group {
  margin-bottom: 1.5rem;
}

.form-group label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
  color: var(--text-primary);
  font-weight: 500;
  font-size: 0.95rem;
}

.form-group label i {
  color: var(--primary-color);
  font-size: 0.9rem;
}

.upload-area {
  position: relative;
}

.upload-box {
  border: 2px dashed var(--border-color);
  border-radius: 12px;
  padding: 2rem;
  text-align: center;
  cursor: pointer;
  transition: all 0.3s ease;
  background: rgba(0, 212, 255, 0.02);
}

.upload-box:hover {
  border-color: var(--primary-color);
  background: rgba(0, 212, 255, 0.05);
}

.upload-box i {
  font-size: 3rem;
  color: var(--primary-color);
  margin-bottom: 1rem;
  opacity: 0.6;
}

.upload-text {
  margin: 0 0 0.5rem 0;
  color: var(--text-primary);
  font-weight: 500;
  font-size: 1rem;
}

.upload-hint {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.85rem;
}

.file-preview-card {
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 1rem;
  background: rgba(0, 212, 255, 0.03);
  display: flex;
  align-items: center;
  gap: 1rem;
}

.file-preview-card.new {
  border-color: var(--primary-color);
  background: rgba(0, 212, 255, 0.08);
}

.file-preview-card.readonly {
  cursor: default;
}

.file-icon {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 212, 255, 0.15);
  border-radius: 8px;
  flex-shrink: 0;
}

.file-icon i {
  font-size: 1.5rem;
  color: var(--primary-color);
}

.file-info {
  flex: 1;
  min-width: 0;
}

.file-name {
  margin: 0 0 0.25rem 0;
  color: var(--text-primary);
  font-weight: 500;
  font-size: 0.95rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-status {
  margin: 0;
  font-size: 0.8rem;
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.file-status.existing {
  color: #43e97b;
}

.file-status.new {
  color: var(--primary-color);
}

.file-size {
  margin: 0.25rem 0 0 0;
  color: var(--text-secondary);
  font-size: 0.8rem;
}

.file-actions {
  display: flex;
  gap: 0.5rem;
  flex-shrink: 0;
}

.btn-file {
  padding: 0.5rem 0.75rem;
  border-radius: 6px;
  font-size: 0.85rem;
  font-weight: 500;
  border: none;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}

.btn-replace {
  background: rgba(0, 212, 255, 0.15);
  color: var(--primary-color);
}

.btn-remove {
  background: rgba(245, 87, 108, 0.15);
  color: #f5576c;
}

@media (max-width: 768px) {
  .file-preview-card {
    flex-direction: column;
    align-items: flex-start;
  }

  .file-actions {
    width: 100%;
    justify-content: flex-end;
  }

  .upload-box {
    padding: 1.5rem;
  }

  .upload-box i {
    font-size: 2rem;
  }
}
</style>
