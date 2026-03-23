<template>
  <AdminLayout>
    <template #header-title>{{ $t('admin.chatSettings.title') }}</template>

    <div class="chat-settings-page">
      <div v-if="error" class="alert alert-error">
        <i class="fas fa-exclamation-circle"></i> {{ error }}
      </div>

      <div v-if="success" class="alert alert-success">
        <i class="fas fa-check-circle"></i> {{ success }}
      </div>

      <div class="settings-card">
        <div class="card-header">
          <h2 class="card-title">
            <i class="fas fa-headset"></i> {{ $t('admin.chatSettings.serviceConfigTitle') }}
          </h2>
          <p class="card-desc">{{ $t('admin.chatSettings.serviceConfigDesc') }}</p>
        </div>

        <div v-if="loading" class="loading-state">
          <i class="fas fa-spinner fa-spin"></i>
          <span>{{ $t('common.loading') }}</span>
        </div>

        <div v-else-if="admins.length === 0" class="empty-state">
          <i class="fas fa-inbox"></i>
          <p>{{ $t('admin.chatSettings.noAdmins') }}</p>
        </div>

        <div v-else class="admin-list">
          <div v-for="admin in admins" :key="admin.id" class="admin-item">
            <div class="admin-header">
              <div class="admin-info">
                <div class="admin-avatar" :style="{ background: admin.avatar_color }">
                  {{ getInitials(admin.display_name) }}
                </div>
                <div class="admin-meta">
                  <h3>{{ admin.display_name }}</h3>
                  <p class="admin-role">
                    <i class="fas fa-tag"></i>
                    {{ admin.username === 'support' ? $t('admin.chatSettings.officialSupport') : $t('admin.chatSettings.salesConsult') }}
                  </p>
                </div>
              </div>
              <div class="admin-status">
                <span class="status-badge" :class="{ enabled: admin.chatbot_enabled }">
                  <span class="status-dot"></span>
                  {{ admin.chatbot_enabled ? $t('admin.chatSettings.botEnabled') : $t('admin.chatSettings.botDisabled') }}
                </span>
              </div>
            </div>

            <div class="admin-config">
              <div class="config-section">
                <h4 class="section-title">
                  <i class="fas fa-robot"></i> {{ $t('admin.chatSettings.chatbotSection') }}
                </h4>
                <label class="toggle-switch">
                  <input
                    type="checkbox"
                    :checked="admin.chatbot_enabled"
                    @change="updateChatbotStatus(admin.id, $event.target.checked)"
                  />
                  <span class="toggle-slider"></span>
                  <span class="toggle-label">{{ admin.chatbot_enabled ? $t('common.enabled') : $t('common.disabled') }}</span>
                </label>
              </div>

              <div class="config-section">
                <h4 class="section-title">
                  <i class="fab fa-telegram-plane"></i> {{ $t('admin.chatSettings.telegramSection') }}
                </h4>
                <div class="form-row">
                  <div class="form-group">
                    <label>
                      <i class="fas fa-comment"></i> {{ $t('admin.chatSettings.telegramToken') }}
                    </label>
                    <input
                      type="password"
                      v-model="admin.telegram_token"
                      @blur="saveAdminConfig(admin)"
                      :placeholder="$t('admin.chatSettings.tokenPlaceholder')"
                    />
                  </div>
                  <div class="form-group">
                    <label>
                      <i class="fas fa-users"></i> {{ $t('admin.chatSettings.telegramChatId') }}
                    </label>
                    <input
                      type="text"
                      v-model="admin.telegram_chat_id"
                      @blur="saveAdminConfig(admin)"
                      :placeholder="$t('admin.chatSettings.chatIdPlaceholder')"
                    />
                  </div>
                </div>
                <p class="form-hint">
                  <i class="fas fa-info-circle"></i> {{ $t('admin.chatSettings.configAutoSave') }}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="help-card">
        <h3><i class="fas fa-question-circle"></i> {{ $t('admin.chatSettings.helpTitle') }}</h3>
        <ul>
          <li>
            <strong>{{ $t('admin.chatSettings.helpTokenTitle') }} <code class="bot-name"><span>@</span>BotFather</code></strong>
            <span>{{ $t('admin.chatSettings.helpTokenDesc') }}</span>
          </li>
          <li>
            <strong>{{ $t('admin.chatSettings.helpChatIdTitle') }} <code class="bot-name"><span>@</span>myidbot</code></strong>
            <span>{{ $t('admin.chatSettings.helpChatIdDesc') }}</span>
          </li>
        </ul>
      </div>
    </div>
  </AdminLayout>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import AdminLayout from '@/components/admin/AdminLayout.vue'

const { t } = useI18n()

const admins = ref([])
const loading = ref(true)
const error = ref('')
const success = ref('')

function getInitials(name) {
  const s = String(name || '?').trim()
  return s.slice(0, 1).toUpperCase() || '?'
}

async function loadAdmins() {
  loading.value = true
  error.value = ''
  try {
    const res = await fetch('/api/chat/admins')
    const data = await res.json()
    admins.value = data.admins || []
  } catch (e) {
    error.value = t('admin.chatSettings.loadError')
  } finally {
    loading.value = false
  }
}

async function updateChatbotStatus(adminId, enabled) {
  try {
    const res = await fetch('/api/admin/chat-admins/' + adminId + '/chatbot', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    })
    if (!res.ok) throw new Error('Failed to update')
    success.value = enabled ? t('admin.chatSettings.chatbotEnabled') : t('admin.chatSettings.chatbotDisabled')
    setTimeout(() => { success.value = '' }, 3000)
    await loadAdmins()
  } catch (e) {
    error.value = e.message
    setTimeout(() => { error.value = '' }, 3000)
    await loadAdmins()
  }
}

async function saveAdminConfig(admin) {
  try {
    const res = await fetch('/api/admin/chat-admins/' + admin.id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        display_name: admin.display_name,
        bio: admin.bio || '',
        avatar_color: admin.avatar_color || '#07c160',
        telegram_chat_id: admin.telegram_chat_id || null,
        telegram_token: admin.telegram_token || null,
        chatbot_enabled: !!admin.chatbot_enabled,
      }),
    })
    if (!res.ok) throw new Error('Failed to update')
    success.value = t('admin.chatSettings.settingsSaved')
    setTimeout(() => { success.value = '' }, 3000)
  } catch (e) {
    error.value = e.message
    setTimeout(() => { error.value = '' }, 3000)
    await loadAdmins()
  }
}

onMounted(() => {
  loadAdmins()
})
</script>

<style scoped>
.chat-settings-page {
  padding: 1.5rem;
  max-width: 1000px;
  margin: 0 auto;
}

.alert {
  padding: 1rem 1.25rem;
  border-radius: 8px;
  margin-bottom: 1.5rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.alert-error {
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #ef4444;
}

.alert-success {
  background: rgba(34, 197, 94, 0.1);
  border: 1px solid rgba(34, 197, 94, 0.3);
  color: #22c55e;
}

.settings-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  margin-bottom: 1.5rem;
  overflow: hidden;
}

.card-header {
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-dark);
}

.card-title {
  color: var(--text-primary);
  font-size: 1.125rem;
  margin: 0 0 0.5rem 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.card-title i {
  color: var(--primary-color);
}

.card-desc {
  color: var(--text-secondary);
  font-size: 0.875rem;
  margin: 0;
}

.loading-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem;
  color: var(--text-secondary);
}

.loading-state i {
  color: var(--primary-color);
}

.loading-state i,
.empty-state i {
  font-size: 2rem;
  margin-bottom: 0.5rem;
}

.admin-list {
  display: flex;
  flex-direction: column;
}

.admin-item {
  border-bottom: 1px solid var(--border-color);
}

.admin-item:last-child {
  border-bottom: none;
}

.admin-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.25rem 1.5rem;
  background: rgba(10, 14, 39, 0.3);
}

.admin-info {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.admin-avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: bold;
  font-size: 1.1rem;
}

.admin-meta h3 {
  color: var(--text-primary);
  font-size: 1rem;
  margin: 0 0 0.25rem 0;
}

.admin-role {
  color: var(--text-secondary);
  font-size: 0.8rem;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

.admin-status {
  display: flex;
  align-items: center;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.375rem 0.75rem;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 500;
  background: rgba(148, 163, 184, 0.15);
  color: var(--text-secondary);
}

.status-badge.enabled {
  background: rgba(34, 197, 94, 0.15);
  color: #22c55e;
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.admin-config {
  padding: 1.25rem 1.5rem;
}

.config-section {
  margin-bottom: 1.5rem;
  padding-bottom: 1.5rem;
  border-bottom: 1px solid var(--border-color);
}

.config-section:last-child {
  margin-bottom: 0;
  padding-bottom: 0;
  border-bottom: none;
}

.section-title {
  color: var(--text-primary);
  font-size: 0.875rem;
  font-weight: 600;
  margin: 0 0 1rem 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.section-title i {
  color: var(--primary-color);
}

.toggle-switch {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  cursor: pointer;
}

.toggle-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-slider {
  position: relative;
  width: 44px;
  height: 24px;
  background-color: var(--border-color);
  border-radius: 24px;
  transition: 0.3s;
  flex-shrink: 0;
}

.toggle-slider:before {
  position: absolute;
  content: "";
  height: 18px;
  width: 18px;
  left: 3px;
  bottom: 3px;
  background-color: white;
  transition: 0.3s;
  border-radius: 50%;
}

.toggle-switch input:checked + .toggle-slider {
  background-color: var(--primary-color);
}

.toggle-switch input:checked + .toggle-slider:before {
  transform: translateX(20px);
}

.toggle-label {
  color: var(--text-secondary);
  font-size: 0.875rem;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.form-group label {
  color: var(--text-secondary);
  font-size: 0.75rem;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

.form-group label i {
  color: var(--primary-color);
}

.form-group input {
  padding: 0.625rem 0.875rem;
  background: var(--bg-dark);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 0.875rem;
  transition: border-color 0.2s;
}

.form-group input:focus {
  outline: none;
  border-color: var(--primary-color);
}

.form-hint {
  margin: 0.75rem 0 0 0;
  font-size: 0.75rem;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

.form-hint i {
  color: var(--primary-color);
}

.help-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 1.5rem;
}

.help-card h3 {
  color: var(--text-primary);
  font-size: 1rem;
  margin: 0 0 1rem 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.help-card h3 i {
  color: var(--primary-color);
}

.help-card ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

.help-card li {
  padding: 0.75rem 0;
  border-bottom: 1px solid var(--border-color);
  color: var(--text-secondary);
  font-size: 0.875rem;
  line-height: 1.6;
}

.help-card li:last-child {
  border-bottom: none;
}

.help-card li strong {
  color: var(--text-primary);
  display: block;
  margin-bottom: 0.25rem;
}

@media (max-width: 768px) {
  .form-row {
    grid-template-columns: 1fr;
  }

  .admin-header {
    flex-direction: column;
    gap: 1rem;
    align-items: flex-start;
  }
}
</style>
