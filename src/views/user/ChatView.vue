<template>
  <div class="chat-page">
    <AppHeader />
    
    <!-- 联系我们（无需登录） -->
    <div v-if="!sessionId || !isLoggedIn" class="chat-setup">
      <div class="setup-card">
        <div class="setup-header">
          <h2 class="setup-title">
            <i class="fas fa-headset"></i>
            {{ $t('chat.hub.title') }}
          </h2>
          <p class="setup-desc">{{ $t('chat.hub.desc') }}</p>
        </div>

        <div v-if="error" class="alert alert-error">
          <i class="fas fa-exclamation-circle"></i> {{ error }}
        </div>

        <button
          type="button"
          class="btn btn-primary btn-block btn-large hub-btn-online"
          :disabled="startingChat || (isLoggedIn && loading)"
          @click="startOnlineChat"
        >
          <i v-if="startingChat" class="fas fa-spinner fa-spin"></i>
          <i v-else class="fas fa-comments"></i>
          {{ startingChat ? $t('chat.hub.connecting') : $t('chat.hub.onlineChat') }}
        </button>

        <div class="hub-divider">
          <span>{{ $t('chat.hub.communityTitle') }}</span>
        </div>

        <div class="community-actions">
          <button
            type="button"
            class="community-btn telegram"
            :disabled="!communityLinks.telegramGroupUrl"
            @click="openCommunityLink(communityLinks.telegramGroupUrl)"
          >
            <i class="fab fa-telegram-plane"></i>
            <span>{{ $t('chat.hub.telegramGroup') }}</span>
          </button>
          <button
            type="button"
            class="community-btn qq"
            :disabled="!communityLinks.qqGroupUrl"
            @click="openCommunityLink(communityLinks.qqGroupUrl)"
          >
            <i class="fab fa-qq"></i>
            <span>{{ $t('chat.hub.qqGroup') }}</span>
          </button>
        </div>
        <p v-if="!communityLinks.telegramGroupUrl && !communityLinks.qqGroupUrl" class="community-hint">
          <i class="fas fa-info-circle"></i> {{ $t('chat.hub.communityEmpty') }}
        </p>
        <p v-else class="community-hint">
          <i class="fas fa-external-link-alt"></i> {{ $t('chat.hub.communityHint') }}
        </p>
      </div>
    </div>

    <!-- 聊天界面（需登录） -->
    <div v-else-if="sessionId && isLoggedIn" class="chat-screen">
      <header class="chat-header">
        <button class="chat-back" @click="backToSetup">
          <i class="fas fa-arrow-left"></i>
        </button>
        <div class="chat-header-center">
          <span class="chat-title">{{ $t('chat.hub.onlineChat') }}</span>
          <span class="chat-subtitle">{{ $t('chat.online') }}</span>
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

        <ChatMessageRow
          v-for="msg in messages"
          :key="msg.id"
          :message="msg"
          :admin-avatar-color="sessionMeta?.admin_avatar_color"
        />
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
          :disabled="!inputMessage.trim() || !sessionId"
          @click="sendMessage"
        >
          <i class="fas fa-paper-plane"></i>
        </button>
      </div>
    </div>

    <LoginModal v-model="showLoginModal" @success="onLoginSuccess" @update:model-value="onLoginModalToggle" />

    <AppFooter />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import AppHeader from '@/components/common/AppHeader.vue'
import AppFooter from '@/components/common/AppFooter.vue'
import LoginModal from '@/components/common/LoginModal.vue'
import ChatMessageRow from '@/components/user/chat/ChatMessageRow.vue'
import { ensureLegacyNodeUserSession } from '@/utils/legacyUserSession'

const CHAT_AUTO_START_KEY = 'chat_auto_start'

const STORAGE_KEY = 'cs_session_id'
const SERVICE_TYPE_KEY = 'cs_service_type'

const { t } = useI18n()
const authStore = useAuthStore()

const isLoggedIn = computed(() => authStore.isLoggedIn)

let ws = null
let reconnectTimer = null

const admins = ref([])
const selectedAdminId = ref(null)
const sessionId = ref(null)
const sessionMeta = ref(null)
const serviceType = ref('support')
const communityLinks = ref({ telegramGroupUrl: '', qqGroupUrl: '' })
const inputMessage = ref('')
const messages = ref([])
const error = ref('')
const loading = ref(true)
const startingChat = ref(false)
const loadHistoryLoading = ref(false)
const wsConnected = ref(false)
const messagesContainer = ref(null)
const inputEl = ref(null)
const showLoginModal = ref(false)
const pendingStartChat = ref(false)

const seenMessageIds = new Set()

/** 在线客服请求须携带 Cookie，以同步 Laravel → Node 用户会话 */
function chatFetch(url, options = {}) {
  return fetch(url, {
    credentials: 'include',
    ...options
  })
}

/** 在线客服固定对接官方客服账号 support */
function resolveSupportAdmin() {
  if (!admins.value.length) return null
  return admins.value.find((a) => a.username === 'support') || admins.value[0]
}

function openCommunityLink(url) {
  const raw = String(url || '').trim()
  if (!raw) return
  const href = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
  window.open(href, '_blank', 'noopener,noreferrer')
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
      appendMessage(data.message, true)
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

function scrollMessagesToBottom() {
  nextTick(() => {
    requestAnimationFrame(() => {
      const el = messagesContainer.value
      if (!el) return
      el.scrollTop = el.scrollHeight
    })
  })
}

function appendMessage(row, scrollBottom = true) {
  if (row.id != null) {
    if (seenMessageIds.has(row.id)) return
    seenMessageIds.add(row.id)
  }
  messages.value.push(row)
  if (scrollBottom) {
    scrollMessagesToBottom()
  }
}

function autoResize() {
  const el = inputEl.value
  if (!el) return
  const maxHeight = 120
  el.style.height = 'auto'
  const contentHeight = el.scrollHeight
  if (contentHeight > maxHeight) {
    el.style.height = `${maxHeight}px`
    el.style.overflowY = 'auto'
  } else {
    el.style.height = `${contentHeight}px`
    el.style.overflowY = 'hidden'
  }
}

async function loadAdmins() {
  loading.value = true
  error.value = ''
  try {
    const res = await chatFetch('/api/chat/admins')
    const data = await res.json()
    admins.value = data.admins || []
  } catch (e) {
    error.value = t('chat.loadAdminsError') || 'Failed to load agents'
  } finally {
    loading.value = false
  }
}

async function loadCommunityLinks() {
  try {
    const res = await chatFetch('/api/chat/community-links')
    if (res.ok) {
      communityLinks.value = await res.json()
    }
  } catch (e) {
    console.error('Failed to load community links:', e)
  }
}

async function loadUserSession() {
  try {
    const res = await chatFetch('/api/chat/user-session', {
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
    const res = await chatFetch(`/api/chat/sessions/${encodeURIComponent(sessionId.value)}/messages`)
    const data = await res.json()
    messages.value = data.messages || []
    seenMessageIds.clear()
    for (const row of messages.value) {
      if (row.id != null) seenMessageIds.add(row.id)
    }
    connectWs()
    scrollMessagesToBottom()
    nextTick(() => {
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

function onLoginModalToggle(open) {
  if (!open) pendingStartChat.value = false
}

async function onLoginSuccess() {
  await enterOnlineChat()
}

async function enterOnlineChat() {
  if (!authStore.isLoggedIn) return
  const nodeReady = await ensureLegacyNodeUserSession()
  if (!nodeReady) {
    error.value = t('chat.nodeSessionError')
    pendingStartChat.value = false
    return
  }
  if (!admins.value.length) {
    await loadAdmins()
  }
  const supportAdmin = resolveSupportAdmin()
  if (!supportAdmin) {
    error.value = t('chat.noAgents')
    pendingStartChat.value = false
    return
  }
  selectedAdminId.value = supportAdmin.id
  serviceType.value = 'support'
  startingChat.value = true
  try {
    // 优先恢复已有会话，没有再新建，保证点击「在线客服」才进入聊天
    const restored = await loadUserSession()
    if (!restored) {
      await startSession()
    }
  } finally {
    startingChat.value = false
    pendingStartChat.value = false
  }
}

async function startOnlineChat() {
  error.value = ''
  if (!authStore.isLoggedIn) {
    pendingStartChat.value = true
    showLoginModal.value = true
    return
  }
  await enterOnlineChat()
}

async function startSession() {
  error.value = ''
  if (!authStore.isLoggedIn) return
  if (!selectedAdminId.value) return

  try {
    const res = await chatFetch('/api/chat/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nickname: authStore.user.username,
        admin_id: selectedAdminId.value,
        service_type: serviceType.value
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
    const res = await chatFetch(`/api/chat/sessions/${encodeURIComponent(sessionId.value)}/messages`, {
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
  await loadCommunityLinks()

  if (!authStore.isLoggedIn) {
    loading.value = false
    return
  }

  await loadAdmins()

  // 仅当用户点击「在线客服」后（自动开聊标记）才进入聊天；
  // 顶部导航进入客服页时停留在「联系我们」入口页，不自动进入聊天
  const autoStart = sessionStorage.getItem(CHAT_AUTO_START_KEY) === '1'
  if (autoStart) {
    sessionStorage.removeItem(CHAT_AUTO_START_KEY)
    await enterOnlineChat()
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

.hub-btn-online {
  margin-top: 0.5rem;
}

.hub-divider {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin: 1.75rem 0 1.25rem;
  color: var(--text-secondary);
  font-size: 0.85rem;
}

.hub-divider::before,
.hub-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--border-color);
}

.community-actions {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.community-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  width: 100%;
  padding: 0.9rem 1.25rem;
  border-radius: 12px;
  border: 1px solid var(--border-color);
  background: rgba(255, 255, 255, 0.03);
  color: var(--text-primary);
  font-size: 1rem;
  cursor: pointer;
  transition: border-color 0.2s, background 0.2s;
}

.community-btn i {
  font-size: 1.35rem;
}

.community-btn.telegram:not(:disabled):hover {
  border-color: #229ed9;
  background: rgba(34, 158, 217, 0.12);
  color: #5eb8f0;
}

.community-btn.qq:not(:disabled):hover {
  border-color: #12b7f5;
  background: rgba(18, 183, 245, 0.12);
  color: #5ecfff;
}

.community-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.community-hint {
  margin: 1rem 0 0;
  font-size: 0.8rem;
  color: var(--text-secondary);
  text-align: center;
  line-height: 1.5;
}

.community-hint i {
  margin-right: 0.35rem;
  color: var(--primary-color);
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

</style>

<style scoped src="./styles/chat-view-composer.css"></style>
