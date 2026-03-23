<template>
  <div v-if="visible && notice" class="popup-overlay" @click="handleOverlayClick">
    <div class="popup-modal" @click.stop>
      <div class="popup-header">
        <h3 class="popup-title">{{ notice.title }}</h3>
        <button class="popup-close" @click="closePopup">
          <i class="fas fa-times"></i>
        </button>
      </div>
      <div class="popup-content">
        <div class="popup-body" v-html="formattedContent"></div>
      </div>
      <div class="popup-footer">
        <button class="btn btn-primary" @click="closePopup">
          {{ $t('common.close') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import api from '@/services/api'

const { t } = useI18n()

const visible = ref(false)
const notice = ref(null)
const hasBeenShown = ref(false)

const formattedContent = computed(() => {
  if (!notice.value?.content) return ''
  return notice.value.content.replace(/\n/g, '<br/>')
})

async function fetchNotice() {
  try {
    const res = await api.get('/api/popup-notice')
    if (res.data.notice) {
      notice.value = res.data.notice
      visible.value = true
      hasBeenShown.value = true
    }
  } catch (error) {
    console.error('Failed to fetch popup notice:', error)
  }
}

function closePopup() {
  visible.value = false
}

function handleOverlayClick() {
  closePopup()
}

onMounted(() => {
  if (!hasBeenShown.value) {
    fetchNotice()
  }
})
</script>

<style scoped>
.popup-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  backdrop-filter: blur(4px);
  animation: fadeIn 0.3s ease;
}

.popup-modal {
  background: white;
  border-radius: 16px;
  width: 90%;
  max-width: 500px;
  max-height: 80vh;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  animation: slideIn 0.3s ease;
}

.popup-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid #e5e7eb;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.popup-title {
  font-size: 1.25rem;
  font-weight: 600;
  margin: 0;
  padding-right: 1rem;
}

.popup-close {
  background: rgba(255, 255, 255, 0.2);
  border: none;
  color: white;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.2s;
  flex-shrink: 0;
}

.popup-close:hover {
  background: rgba(255, 255, 255, 0.3);
}

.popup-content {
  padding: 1.5rem;
  max-height: 50vh;
  overflow-y: auto;
}

.popup-body {
  font-size: 1rem;
  line-height: 1.7;
  color: #374151;
  white-space: pre-wrap;
}

.popup-footer {
  padding: 1rem 1.5rem;
  border-top: 1px solid #e5e7eb;
  display: flex;
  justify-content: flex-end;
  background: #f9fafb;
}

.btn {
  padding: 0.625rem 1.5rem;
  border-radius: 8px;
  font-size: 0.95rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
}

.btn-primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes slideIn {
  from {
    transform: translateY(-20px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

@media (max-width: 640px) {
  .popup-modal {
    width: 95%;
    max-width: none;
  }
  
  .popup-header {
    padding: 1rem;
  }
  
  .popup-content {
    padding: 1rem;
  }
  
  .popup-footer {
    padding: 0.75rem 1rem;
  }
}
</style>
