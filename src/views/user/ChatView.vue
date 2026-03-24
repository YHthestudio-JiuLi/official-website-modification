<template>
  <div class="chat-page">
    <AppHeader />
    
    <!-- 未登录提示 -->
    <div v-if="!isLoggedIn" class="auth-required">
      <div class="auth-card">
        <div class="auth-icon">
          <i class="fas fa-comments"></i>
        </div>
        <h2>{{ $t('chat.authRequired.title') || 'Login Required' }}</h2>
        <p>{{ $t('chat.authRequired.desc') || 'Please login to use the customer service chat' }}</p>
        <div class="auth-actions">
          <router-link to="/login" class="btn btn-primary">
            <i class="fas fa-sign-in-alt"></i> {{ $t('nav.login') || 'Login' }}
          </router-link>
          <router-link to="/register" class="btn btn-secondary">
            <i class="fas fa-user-plus"></i> {{ $t('nav.register') || 'Register' }}
          </router-link>
        </div>
      </div>
    </div>

    <!-- 聊天初始化界面 -->
    <div v-else-if="!sessionId" class="chat-setup">
      <div class="setup-card">
        <div class="setup-header">
          <h2 class="setup-title">
            <i class="fas fa-headset"></i>
            {{ $t('chat.setup.title') || 'Start Conversation' }}
          </h2>
          <p class="setup-desc">{{ $t('chat.setup.desc') || 'Select a service type and start chatting with our team' }}</p>
        </div>

        <div v-if="error" class="alert alert-error">
          <i class="fas fa-exclamation-circle"></i> {{ error }}
        </div>

        <!-- 客服类型选择 -->
        <div class="form-section">
          <label class="section-label">
            <i class="fas fa-briefcase"></i> {{ $t('chat.serviceType') || 'Service Type' }}
          </label>
          <div class="service-type-list">
            <button
              type="button"
              class="service-type-card"
              :class="{ selected: serviceType === 'support' }"
              @click="serviceType = 'support'"
            >
              <div class="service-icon support">
                <i class="fas fa-headset"></i>
              </div>
              <div class="service-info">
                <h3>{{ $t('chat.types.support.title') || 'Customer Support' }}</h3>
                <p>{{ $t('chat.types.support.desc') || 'Technical support and account assistance' }}</p>
              </div>
            </button>
            <button
              type="button"
              class="service-type-card"
              :class="{ selected: serviceType === 'sales' }"
              @click="serviceType = 'sales'"
            >
              <div class="service-icon sales">
                <i class="fas fa-shopping-cart"></i>
              </div>
              <div class="service-info">
                <h3>{{ $t('chat.types.sales.title') || 'Sales Consultation' }}</h3>
                <p>{{ $t('chat.types.sales.desc') || 'Product inquiries and purchase assistance' }}</p>
              </div>
            </button>
          </div>
        </div>

        <!-- 选择客服 -->
        <div class="form-section">
          <label class="section-label">
            <i class="fas fa-user"></i> {{ $t('chat.setup.selectAdmin') || 'Select Agent' }}
          </label>
          <div v-if="loading" class="loading-state">
            <i class="fas fa-spinner fa-spin"></i>
            <span>{{ $t('common.loading') || 'Loading...' }}</span>
          </div>
          <div v-else-if="filteredAdmins.length === 0" class="empty-state">
            <i class="fas fa-user-slash"></i>
            <p>{{ $t('chat.noAgents') || 'No agents available' }}</p>
          </div>
          <div v-else class="admin-list">
            <button
              v-for="admin in filteredAdmins"
              :key="admin.id"
              type="button"
              class="admin-card"
              :class="{ selected: selectedAdminId === admin.id }"
              @click="selectedAdminId = admin.id"
            >
              <div class="admin-avatar" :style="{ background: admin.avatar_color }">
                {{ getInitials(admin.display_name) }}
              </div>
              <div class="admin-meta">
                <h3>{{ admin.display_name }}</h3>
                <span v-if="admin.bio">{{ admin.bio }}</span>
                <span v-else class="admin-status">{{ $t('chat.online') || 'Online' }}</span>
              </div>
              <i v-if="selectedAdminId === admin.id" class="fas fa-check-circle selected-icon"></i>
            </button>
          </div>
        </div>

        <button
          type="button"
          class="btn btn-primary btn-block btn-large"
          :disabled="!canStart"
          @click="startSession"
        >
          <i class="fas fa-comments"></i> {{ $t('chat.setup.startChat') || 'Start Chat' }}
        </button>
      </div>
    </div>

    <!-- 聊天界面 -->
    <div v-else class="chat-screen">
      <header class="chat-header">
        <button class="chat-back" @click="backToSetup">
          <i class="fas fa-arrow-left"></i>
        </button>
        <div class="chat-header-center">
          <span class="chat-title">{{ sessionMeta?.admin_display_name || $t('chat.admin') }}</span>
          <span class="chat-subtitle">{{ serviceType === 'support' ? ($t('chat.types.support.title') || 'Support') : ($t('chat.types.sales.title') || 'Sales') }}</span>
        </div>
        <span class="chat-status" :class="{ online: wsConnected }">
          <span class="status-dot" :class="{ on: wsConnected }"></span>
        </span>
      </header>

      <div class="messages" ref="messagesContainer">
        <div class="cache-notice">
          <i class="fas fa-info-circle"></i>
          {{ $t('chat.cacheNotice') || 'Chat history is kept for 3 hours' }}
        </div>

        <div v-if="loadHistoryLoading" class="loading-history">
          <i class="fas fa-spinner fa-spin"></i>
          <span>Loading history...</span>
        </div>

        <div v-else-if="!loadHistoryLoading && messages.length === 0" class="empty-hint">
          <i class="fas fa-comment-dots"></i>
          <p>{{ $t('chat.emptyHint') || 'No messages yet, say hello!' }}</p>
        </div>

        <div
          v-for="msg in messages"
          :key="msg.id"
          class="msg-row"
          :class="{ me: msg.sender === 'user', them: msg.sender === 'admin' || msg.sender === 'bot' }"
        >
          <div class="msg-avatar" :style="{ background: msg.sender === 'user' ? 'var(--primary-color)' : sessionMeta?.admin_avatar_color || '#07c160' }">
            {{ msg.sender === 'user' ? userInitials : getInitials(sessionMeta?.admin_display_name) }}
          </div>
          <div class="msg-body">
            <div class="bubble">
              <p>{{ msg.body }}</p>
            </div>
            <div class="msg-time">{{ formatTime(msg.created_at) }}</div>
          </div>
        </div>
      </div>

      <div class="composer">
        <textarea
          ref="inputEl"
          v-model="inputMessage"
          rows="1"
          maxlength="4000"
          :placeholder="$t('chat.inputPlaceholder') || 'Type a message...'"
          class="chat-input"
          @keydown.enter.exact.prevent="sendMessage"
          @input="autoResize"
        ></textarea>
        <button
          type="button"
          class="btn btn-send"
          :disabled="!inputMessage.trim() || !wsConnected"
          @click="sendMessage"
        >
          <i class="fas fa-paper-plane"></i>
        </button>
      </div>
    </div>

    <AppFooter />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import AppHeader from '@/components/common/AppHeader.vue'
import AppFooter from '@/components/common/AppFooter.vue'

const STORAGE_KEY = 'cs_session_id'
const SERVICE_TYPE_KEY = 'cs_service_type'

const { t } = useI18n()
const router = useRouter()
const authStore = useAuthStore()

const isLoggedIn = computed(() => authStore.isLoggedIn)
const userInitials = computed(() => {
  const username = authStore.user?.username || '?'
  return username.slice(0, 2).toUpperCase()
})

let ws = null
let reconnectTimer = null

const admins = ref([])
const selectedAdminId = ref(null)
const userSessions = ref([])
const sessionId = ref(null)
const sessionMeta = ref(null)
const serviceType = ref('support') // 'support' or 'sales'
const inputMessage = ref('')
const messages = ref([])
const error = ref('')
const loading = ref(true)
const loadHistoryLoading = ref(false)
const wsConnected = ref(false)
const messagesContainer = ref(null)
const inputEl = ref(null)

const seenMessageIds = new Set()

const filteredAdmins = computed(() => {
  if (!serviceType.value) return admins.value
  return admins.value.filter(admin => !admin.type || admin.type === serviceType.value || admin.type === 'all')
})

const canStart = computed(() => {
  return selectedAdminId.value != null && filteredAdmins.value.length > 0
})

function getInitials(name) {
  const s = String(name || '?').trim()
  return s.slice(0, 1).toUpperCase() || '?'
}

function parseServerDateTime(value) {
  if (!value) return null
  let s = String(value).trim()
  if (!s) return null
  s = s.replace(' ', 'T')
  if (!/[zZ]$/.test(s) && !/[+-]\d{2}:?\d{2}$/.test(s)) {
    s += 'Z'
  }
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

function formatTime(iso) {
  const d = parseServerDateTime(iso)
  if (!d) return iso ? String(iso) : ''
  return d.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function wsUrl() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${location.host}/ws`
}

function connectWs() {
  if (!sessionId.value) return
  if (ws && ws.readyState === WebSocket.OPEN) return
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  wsConnected.value = false
  ws = new WebSocket(wsUrl())
  ws.addEventListener('open', () => {
    ws.send(JSON.stringify({ type: 'auth', role: 'user', sessionId: sessionId.value }))
  })
  ws.addEventListener('message', (ev) => {
    let data
    try {
      data = JSON.parse(ev.data)
    } catch {
      return
    }
    if (data.type === 'auth_ok') {
      wsConnected.value = true
    }
    if (data.type === 'auth_fail') {
      wsConnected.value = false
    }
    if (data.type === 'message' && data.message && data.message.session_id === sessionId.value) {
      appendMessage(data.message, false)
    }
  })
  ws.addEventListener('close', () => {
    wsConnected.value = false
    reconnectTimer = setTimeout(connectWs, 2000)
  })
  ws.addEventListener('error', () => {
    wsConnected.value = false
  })
}

function appendMessage(row, scrollBottom = true) {
  if (row.id != null) {
    if (seenMessageIds.has(row.id)) return
    seenMessageIds.add(row.id)
  }
  messages.value.push(row)
  if (scrollBottom) {
    nextTick(() => {
      if (messagesContainer.value) {
        messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
      }
    })
  }
}

function autoResize() {
  const el = inputEl.value
  if (!el) return
  el.style.height = 'auto'
  const newHeight = Math.min(el.scrollHeight, 120)
  el.style.height = newHeight + 'px'
}

async function loadAdmins() {
  loading.value = true
  error.value = ''
  try {
    const res = await fetch('/api/chat/admins')
    const data = await res.json()
    admins.value = data.admins || []
    if (admins.value.length === 1) {
      selectedAdminId.value = admins.value[0].id
    }
  } catch (e) {
    error.value = t('chat.loadAdminsError') || 'Failed to load agents'
  } finally {
    loading.value = false
  }
}

async function loadUserSessions() {
  try {
    const res = await fetch('/api/chat/user-sessions', {
      headers: { 'Content-Type': 'application/json' }
    })
    if (res.ok) {
      const data = await res.json()
      userSessions.value = data.sessions || []
    }
  } catch (e) {
    console.error('Failed to load user sessions:', e)
  }
}

async function loadUserSession() {
  try {
    const res = await fetch('/api/chat/user-session', {
      headers: { 'Content-Type': 'application/json' }
    })
    if (res.ok) {
      const data = await res.json()
      if (data.session) {
        sessionId.value = data.session.id
        sessionMeta.value = data.session
        serviceType.value = data.session.service_type || 'support'
        localStorage.setItem(STORAGE_KEY, sessionId.value)
        localStorage.setItem(SERVICE_TYPE_KEY, serviceType.value)
        await loadHistory()
        return true
      }
    }
  } catch (e) {
    console.error('Failed to load user session:', e)
  }
  return false
}

async function loadHistory() {
  if (!sessionId.value) return
  loadHistoryLoading.value = true
  try {
    const res = await fetch(`/api/chat/sessions/${encodeURIComponent(sessionId.value)}/messages`)
    const data = await res.json()
    messages.value = data.messages || []
    seenMessageIds.clear()
    connectWs()
    nextTick(() => {
      if (messagesContainer.value) {
        messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
      }
      if (inputEl.value) {
        inputEl.value.focus()
      }
    })
  } catch (e) {
    error.value = t('chat.loadMessagesError') || 'Failed to load messages'
  } finally {
    loadHistoryLoading.value = false
  }
}

async function startSession() {
  error.value = ''
  if (!authStore.isLoggedIn) {
    router.push({ name: 'login', query: { redirect: '/chat' } })
    return
  }
  if (!canStart.value) return
  
  try {
    const res = await fetch('/api/chat/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        nickname: authStore.user.username,
        admin_id: selectedAdminId.value,
        service_type: serviceType.value,
        user_id: authStore.user.id
      }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || t('chat.createSessionError'))
    
    sessionId.value = data.session.id
    sessionMeta.value = data.session
    localStorage.setItem(STORAGE_KEY, sessionId.value)
    localStorage.setItem(SERVICE_TYPE_KEY, serviceType.value)
    
    await loadHistory()
  } catch (e) {
    error.value = e.message || t('chat.networkError')
  }
}

async function sendMessage() {
  const body = inputMessage.value.trim()
  if (!body || !sessionId.value) return
  
  inputMessage.value = ''
  if (inputEl.value) {
    inputEl.value.style.height = 'auto'
  }
  
  try {
    const res = await fetch(`/api/chat/sessions/${encodeURIComponent(sessionId.value)}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sender: 'user', body }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || t('chat.sendError'))
    appendMessage(data.message, true)
  } catch (e) {
    inputMessage.value = body
    error.value = t('chat.sendError') || 'Failed to send'
  }
}

function backToSetup() {
  if (ws) {
    ws.close()
    ws = null
  }
  sessionId.value = null
  sessionMeta.value = null
  localStorage.removeItem(STORAGE_KEY)
  localStorage.removeItem(SERVICE_TYPE_KEY)
  messages.value = []
  error.value = ''
  wsConnected.value = false
  selectedAdminId.value = null
  serviceType.value = 'support'
}

watch(() => authStore.isLoggedIn, (newVal) => {
  if (!newVal && sessionId.value) {
    backToSetup()
  }
})

onMounted(async () => {
  if (!authStore.isLoggedIn) {
    return
  }
  
  await loadAdmins()
  
  // 尝试从后端恢复用户的活跃会话
  const restored = await loadUserSession()
  if (restored) {
    console.log('[Chat] Restored user session from backend')
  }
})

onUnmounted(() => {
  if (ws) {
    ws.close()
    ws = null
  }
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
})
</script>

<style scoped>
.chat-page {
  min-height: 100vh;
  background: var(--bg-dark);
}

/* 未登录提示 */
.auth-required {
  min-height: calc(100vh - 60px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
}

.auth-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  padding: 3rem 2rem;
  text-align: center;
  max-width: 450px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
}

.auth-icon {
  width: 80px;
  height: 80px;
  margin: 0 auto 1.5rem;
  background: linear-gradient(135deg, var(--primary-color) 0%, var(--secondary-color) 100%);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2rem;
  color: white;
}

.auth-card h2 {
  color: var(--text-primary);
  margin-bottom: 0.75rem;
  font-size: 1.5rem;
}

.auth-card p {
  color: var(--text-secondary);
  margin-bottom: 2rem;
  line-height: 1.6;
}

.auth-actions {
  display: flex;
  gap: 1rem;
  justify-content: center;
}

/* 聊天初始化界面 */
.chat-setup {
  min-height: calc(100vh - 60px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem 1rem;
}

.setup-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  padding: 2rem;
  max-width: 600px;
  width: 100%;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
}

.setup-header {
  text-align: center;
  margin-bottom: 2rem;
}

.setup-title {
  color: var(--text-primary);
  font-size: 1.5rem;
  margin-bottom: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
}

.setup-desc {
  color: var(--text-secondary);
  font-size: 0.95rem;
}

.form-section {
  margin-bottom: 1.5rem;
}

.section-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--text-primary);
  font-weight: 600;
  margin-bottom: 0.75rem;
}

.section-label i {
  color: var(--primary-color);
}

/* 服务类型选择 */
.service-type-list {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1rem;
}

.service-type-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 1.25rem;
  background: var(--bg-dark);
  border: 2px solid var(--border-color);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.3s ease;
  text-align: center;
}

.service-type-card:hover {
  border-color: rgba(0, 212, 255, 0.4);
  background: rgba(0, 212, 255, 0.05);
}

.service-type-card.selected {
  border-color: var(--primary-color);
  background: rgba(0, 212, 255, 0.1);
  box-shadow: 0 0 20px rgba(0, 212, 255, 0.2);
}

.service-icon {
  width: 50px;
  height: 50px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
  color: white;
  margin-bottom: 0.75rem;
}

.service-icon.support {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.service-icon.sales {
  background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
}

.service-info h3 {
  color: var(--text-primary);
  font-size: 0.95rem;
  margin-bottom: 0.25rem;
}

.service-info p {
  color: var(--text-secondary);
  font-size: 0.8rem;
  line-height: 1.4;
}

/* 客服列表 */
.admin-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.admin-card {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  border: 2px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-dark);
  cursor: pointer;
  transition: all 0.2s;
  text-align: left;
  width: 100%;
  position: relative;
}

.admin-card:hover {
  border-color: rgba(0, 212, 255, 0.4);
  background: rgba(0, 212, 255, 0.05);
}

.admin-card.selected {
  border-color: var(--primary-color);
  background: rgba(0, 212, 255, 0.1);
}

.selected-icon {
  position: absolute;
  right: 1rem;
  color: var(--primary-color);
  font-size: 1.25rem;
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
  flex-shrink: 0;
}

.admin-meta {
  flex: 1;
}

.admin-meta h3 {
  color: var(--text-primary);
  font-size: 1rem;
  margin: 0 0 0.25rem 0;
}

.admin-meta span {
  color: var(--text-secondary);
  font-size: 0.85rem;
}

/* 加载状态 */
.loading-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  color: var(--text-secondary);
}

.loading-state i,
.empty-state i {
  font-size: 2rem;
  margin-bottom: 0.5rem;
  color: var(--primary-color);
}

.empty-state i {
  color: var(--border-color);
}

/* 聊天界面 */
.chat-screen {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 60px);
  max-width: 800px;
  margin: 0 auto;
  background: var(--bg-card);
  border-left: 1px solid var(--border-color);
  border-right: 1px solid var(--border-color);
}

.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem;
  background: var(--bg-dark);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.chat-back {
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 1.1rem;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  transition: all 0.2s;
}

.chat-back:hover {
  background: rgba(0, 212, 255, 0.1);
  color: var(--primary-color);
}

.chat-header-center {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.chat-title {
  font-weight: 600;
  color: var(--text-primary);
  font-size: 1rem;
}

.chat-subtitle {
  font-size: 0.75rem;
  color: var(--text-secondary);
  margin-top: 0.125rem;
}

.chat-status {
  display: flex;
  align-items: center;
}

.status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--border-color);
  transition: background 0.2s;
}

.status-dot.on {
  background: var(--primary-color);
  box-shadow: 0 0 10px rgba(0, 212, 255, 0.5);
}

/* 消息区域 */
.messages {
  flex: 1;
  overflow-y: auto;
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  background: var(--bg-dark);
}

.cache-notice {
  text-align: center;
  padding: 0.5rem 1rem;
  background: rgba(0, 212, 255, 0.1);
  border: 1px solid rgba(0, 212, 255, 0.2);
  border-radius: 8px;
  color: var(--text-secondary);
  font-size: 0.8rem;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
}

.cache-notice i {
  color: var(--primary-color);
}

.messages::-webkit-scrollbar {
  width: 6px;
}

.messages::-webkit-scrollbar-track {
  background: var(--bg-dark);
}

.messages::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: 3px;
}

.loading-history {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 2rem;
  color: var(--text-secondary);
}

.empty-hint {
  text-align: center;
  color: var(--text-secondary);
  padding: 3rem 1rem;
}

.empty-hint i {
  font-size: 3rem;
  margin-bottom: 1rem;
  opacity: 0.3;
}

.empty-hint p {
  margin: 0;
  font-size: 0.95rem;
}

/* 消息行 */
.msg-row {
  display: flex;
  align-items: flex-end;
  gap: 0.75rem;
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.msg-row.me {
  flex-direction: row-reverse;
}

.msg-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 0.9rem;
  font-weight: bold;
  flex-shrink: 0;
}

.msg-body {
  display: flex;
  flex-direction: column;
  max-width: 75%;
}

.msg-row.me .msg-body {
  align-items: flex-end;
}

.bubble {
  background: var(--bg-card);
  padding: 0.75rem 1rem;
  border-radius: 12px;
  border: 1px solid var(--border-color);
  word-wrap: break-word;
}

.bubble p {
  margin: 0;
  color: var(--text-primary);
  line-height: 1.5;
  white-space: pre-wrap;
}

.msg-row.me .bubble {
  background: linear-gradient(135deg, var(--primary-color) 0%, var(--secondary-color) 100%);
  border: none;
}

.msg-row.me .bubble p {
  color: white;
}

.msg-time {
  font-size: 0.7rem;
  color: var(--text-secondary);
  margin-top: 0.375rem;
}

/* 输入区域 */
.composer {
  display: flex;
  gap: 0.75rem;
  padding: 1rem 1.25rem;
  background: var(--bg-card);
  border-top: 1px solid var(--border-color);
  flex-shrink: 0;
}

.chat-input {
  flex: 1;
  padding: 0.75rem 1rem;
  background: var(--bg-dark);
  border: 1px solid var(--border-color);
  border-radius: 20px;
  resize: none;
  max-height: 120px;
  font-family: inherit;
  font-size: 0.95rem;
  color: var(--text-primary);
  line-height: 1.4;
  transition: border-color 0.2s;
}

.chat-input:focus {
  outline: none;
  border-color: var(--primary-color);
}

.chat-input::placeholder {
  color: var(--text-secondary);
}

.btn-send {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--primary-color) 0%, var(--secondary-color) 100%);
  color: white;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.1rem;
  transition: all 0.2s;
  flex-shrink: 0;
}

.btn-send:hover:not(:disabled) {
  transform: scale(1.05);
  box-shadow: 0 4px 15px rgba(0, 212, 255, 0.4);
}

.btn-send:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

/* 响应式 */
@media (max-width: 640px) {
  .setup-card {
    padding: 1.5rem;
  }
  
  .service-type-list {
    grid-template-columns: 1fr;
  }
  
  .auth-actions {
    flex-direction: column;
  }
  
  .msg-body {
    max-width: 85%;
  }
}
</style>
