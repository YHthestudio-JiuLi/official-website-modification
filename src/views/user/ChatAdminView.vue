<template>
  <div class="admin-chat-app">
    <!-- 登录界面 -->
    <div v-if="!isLoggedIn" class="admin-login-overlay">
      <div class="admin-login-card">
        <div class="admin-login-brand">
          <span class="admin-login-logo">客</span>
          <div>
            <h1>{{ $t('adminChat.login.title') }}</h1>
            <p class="admin-login-tagline">{{ $t('adminChat.login.subtitle') }}</p>
          </div>
        </div>

        <div v-if="loginError" class="alert alert-error">
          <i class="fas fa-exclamation-circle"></i> {{ loginError }}
        </div>

        <div class="form-group">
          <label for="admin-password">
            <i class="fas fa-lock"></i> {{ $t('adminChat.login.password') }}
          </label>
          <input
            type="password"
            id="admin-password"
            v-model="password"
            :placeholder="$t('adminChat.login.passwordPlaceholder')"
            class="form-control"
            @keydown.enter="handleLogin"
          />
        </div>

        <button type="button" class="btn btn-primary btn-block" @click="handleLogin">
          <i class="fas fa-sign-in-alt"></i> {{ $t('adminChat.login.submit') }}
        </button>
      </div>
    </div>

    <!-- 工作区 -->
    <div v-else class="admin-workspace">
      <header class="admin-bar">
        <div class="admin-bar-left">
          <span class="admin-bar-title">{{ $t('adminChat.workspace.title') }}</span>
          <span class="admin-ws-pill" :class="{ connected: wsConnected }">
            <span class="status-dot" :class="{ on: wsConnected }"></span>
            {{ wsConnected ? $t('adminChat.workspace.connected') : $t('adminChat.workspace.connecting') }}
          </span>
        </div>
        <button type="button" class="btn btn-logout" @click="handleLogout">
          <i class="fas fa-sign-out-alt"></i> {{ $t('adminChat.workspace.logout') }}
        </button>
      </header>

      <div class="admin-main">
        <aside class="conv-panel">
          <div class="conv-panel-head">
            <div class="conv-head-top">
              <span>{{ $t('adminChat.workspace.conversations') }}</span>
              <span class="conv-count">{{ conversations.length }}</span>
            </div>
            
            <!-- 服务类型筛选 -->
            <div class="service-filter">
              <button 
                type="button" 
                class="filter-btn"
                :class="{ active: serviceFilter === 'all' }"
                @click="serviceFilter = 'all'"
              >
                <i class="fas fa-inbox"></i> 全部
              </button>
              <button 
                type="button" 
                class="filter-btn"
                :class="{ active: serviceFilter === 'support' }"
                @click="serviceFilter = 'support'"
              >
                <i class="fas fa-headset"></i> 官方客服
              </button>
              <button 
                type="button" 
                class="filter-btn"
                :class="{ active: serviceFilter === 'sales' }"
                @click="serviceFilter = 'sales'"
              >
                <i class="fas fa-shopping-cart"></i> 售前咨询
              </button>
            </div>
            
            <span class="conv-panel-sub">{{ $t('adminChat.workspace.selectUser') }}</span>
          </div>
          
          <div class="conv-list">
            <div v-if="filteredConversations.length === 0" class="empty-conv">
              <i class="fas fa-inbox"></i>
              <p>暂无会话</p>
            </div>
            <div
              v-for="conv in filteredConversations"
              :key="conv.session_id"
              class="conv-item"
              :class="{ active: activeSessionId === conv.session_id }"
              @click="selectSession(conv.session_id)"
            >
              <div class="mini-av">{{ getInitials(conv.nickname) }}</div>
              <div class="conv-item-body">
                <div class="conv-item-top">
                  <strong>{{ conv.nickname }}</strong>
                  <span class="service-type-badge" :class="conv.service_type || 'support'">
                    {{ (conv.service_type || 'support') === 'support' ? '客服' : '售前' }}
                  </span>
                  <time class="conv-time">{{ formatSidebarTime(conv.last_at) }}</time>
                </div>
                <div class="conv-item-bottom">
                  <span class="conv-preview">{{ conv.last_body || '（暂无消息）' }}</span>
                  <span v-if="conv.last_sender === 'user' && conv.session_id !== activeSessionId" class="conv-pending">
                    {{ $t('adminChat.workspace.pending') }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </aside>

        <section class="admin-chat">
          <header class="admin-chat-head">
            <div class="admin-chat-head-inner">
              <div class="admin-chat-avatar" :style="{ background: '#10aeff' }">
                {{ activeMeta ? getInitials(activeMeta.nickname) : '?' }}
              </div>
              <div class="title-block">
                <span class="admin-chat-title">{{ activeMeta?.nickname || $t('adminChat.workspace.selectUser') }}</span>
                <div class="admin-chat-meta">
                  <span v-if="activeMeta?.service_type" class="service-badge" :class="activeMeta.service_type">
                    <i :class="activeMeta.service_type === 'support' ? 'fas fa-headset' : 'fas fa-shopping-cart'"></i>
                    {{ activeMeta.service_type === 'support' ? '官方客服' : '售前咨询' }}
                  </span>
                  <span class="admin-chat-sub">{{ activeMeta?.admin_display_name || '' }}</span>
                </div>
              </div>
            </div>
          </header>

          <div class="messages admin-messages" ref="messagesContainer">
            <div v-if="loadHistoryLoading" class="loading-history">
              <i class="fas fa-spinner fa-spin"></i>
              <span>加载历史消息...</span>
            </div>
            
            <div v-else-if="messages.length === 0 && activeSessionId" class="empty-hint">
              <i class="fas fa-comment-dots"></i>
              <p>暂无消息，主动和用户打个招呼吧</p>
            </div>
            
            <div
              v-for="msg in messages"
              :key="msg.id"
              class="msg-row"
              :class="{ me: msg.sender === 'admin' || msg.sender === 'bot', them: msg.sender === 'user' }"
            >
              <div class="msg-avatar" :style="{ background: (msg.sender === 'admin' || msg.sender === 'bot') ? (activeMeta?.admin_avatar_color || '#07c160') : '#10aeff' }">
                {{ (msg.sender === 'admin' || msg.sender === 'bot') ? getInitials(activeMeta?.admin_display_name) : (activeMeta ? getInitials(activeMeta.nickname) : '?') }}
              </div>
              <div class="msg-body">
                <div class="bubble">
                  <p>{{ msg.body }}</p>
                </div>
                <div class="msg-time">{{ formatTime(msg.created_at) }}</div>
              </div>
            </div>
          </div>

          <div class="admin-composer">
            <div class="admin-input-card">
              <div class="admin-input-row">
                <textarea
                  ref="inputEl"
                  v-model="inputMessage"
                  rows="1"
                  maxlength="4000"
                  :placeholder="$t('adminChat.workspace.inputPlaceholder')"
                  class="admin-textarea"
                  :disabled="!activeSessionId"
                  @keydown.enter.exact.prevent="sendReply"
                  @input="syncInputHeight"
                ></textarea>
                <button
                  type="button"
                  class="btn btn-send"
                  :disabled="!inputMessage.trim() || !activeSessionId"
                  @click="sendReply"
                >
                  <i class="fas fa-paper-plane"></i> {{ $t('adminChat.workspace.send') }}
                </button>
              </div>
              <div class="admin-input-meta">
                <span class="admin-input-hint">{{ $t('adminChat.workspace.hint') }}</span>
                <span class="admin-input-count">{{ inputMessage.length }} / 4000</span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAdminStore } from '@/stores/admin'

const TOKEN_KEY = 'cs_admin_token'

const { t } = useI18n()
const router = useRouter()
const adminStore = useAdminStore()

let ws = null
let reconnectTimer = null

const isLoggedIn = ref(false)
const token = ref('')
const password = ref('')
const loginError = ref('')
const wsConnected = ref(false)
const activeSessionId = ref(null)
const activeMeta = ref(null)
const conversations = ref([])
const messages = ref([])
const inputMessage = ref('')
const messagesContainer = ref(null)
const inputEl = ref(null)
const loadHistoryLoading = ref(false)
const serviceFilter = ref('all') // 'all', 'support', 'sales'

const seenMessageIds = new Set()

const filteredConversations = computed(() => {
  if (serviceFilter.value === 'all') return conversations.value
  return conversations.value.filter(conv => (conv.service_type || 'support') === serviceFilter.value)
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

function formatSidebarTime(iso) {
  const d = parseServerDateTime(iso)
  if (!d) return ''
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  if (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  ) {
    return hm
  }
  const y = new Date(now)
  y.setDate(y.getDate() - 1)
  if (
    d.getFullYear() === y.getFullYear() &&
    d.getMonth() === y.getMonth() &&
    d.getDate() === y.getDate()
  ) {
    return `昨天 ${hm}`
  }
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${hm}`
}

function wsUrl() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${location.host}/ws`
}

function authHeaders() {
  return { Authorization: `Bearer ${token.value}` }
}

function connectWs() {
  if (!token.value) return
  if (ws && ws.readyState === WebSocket.OPEN) return
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  wsConnected.value = false
  ws = new WebSocket(wsUrl())
  ws.addEventListener('open', () => {
    ws.send(JSON.stringify({ type: 'admin_auth', token: token.value }))
  })
  ws.addEventListener('message', (ev) => {
    let data
    try {
      data = JSON.parse(ev.data)
    } catch {
      return
    }
    if (data.type === 'admin_auth_ok') {
      wsConnected.value = true
    }
    if (data.type === 'admin_auth_fail') {
      wsConnected.value = false
    }
    if (data.type === 'message' && data.message) {
      if (data.message.session_id === activeSessionId.value) {
        appendMessage(data.message, false)
      } else {
        refreshConversations()
      }
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

async function handleLogin() {
  loginError.value = ''
  if (!password.value.trim()) {
    loginError.value = '请输入密码'
    return
  }
  try {
    const res = await fetch('/api/chat/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: password.value }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Login failed')
    token.value = data.token
    localStorage.setItem(TOKEN_KEY, token.value)
    isLoggedIn.value = true
    connectWs()
    await loadConversations()
    password.value = ''
  } catch (e) {
    loginError.value = e.message
  }
}

async function loadConversations() {
  try {
    const res = await fetch('/api/chat/admin/conversations', {
      headers: authHeaders(),
    })
    const data = await res.json()
    conversations.value = data.conversations || []
  } catch (e) {
    console.error('Failed to load conversations:', e)
  }
}

async function refreshConversations() {
  await loadConversations()
}

async function selectSession(sessionId) {
  if (activeSessionId.value === sessionId) return
  activeSessionId.value = sessionId
  messages.value = []
  seenMessageIds.clear()
  
  const conv = conversations.value.find(c => c.session_id === sessionId)
  if (conv) {
    activeMeta.value = {
      nickname: conv.nickname,
      admin_display_name: conv.admin_display_name,
      admin_avatar_color: conv.admin_avatar_color,
      service_type: conv.service_type,
    }
  }
  
  await loadMessages(sessionId)
}

async function loadMessages(sessionId) {
  loadHistoryLoading.value = true
  try {
    const res = await fetch(`/api/chat/sessions/${encodeURIComponent(sessionId)}/messages`)
    const data = await res.json()
    messages.value = data.messages || []
    nextTick(() => {
      if (messagesContainer.value) {
        messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
      }
    })
  } catch (e) {
    console.error('Failed to load messages:', e)
  } finally {
    loadHistoryLoading.value = false
  }
}

async function sendReply() {
  const body = inputMessage.value.trim()
  if (!body || !activeSessionId.value) return
  inputMessage.value = ''
  if (inputEl.value) {
    inputEl.value.style.height = 'auto'
  }
  try {
    const res = await fetch(`/api/chat/sessions/${encodeURIComponent(activeSessionId.value)}/messages`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ sender: 'admin', body }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Failed to send')
    appendMessage(data.message, true)
    await refreshConversations()
  } catch (e) {
    inputMessage.value = body
    alert('发送失败：' + (e.message || '未知错误'))
  }
}

function syncInputHeight() {
  const el = inputEl.value
  if (!el) return
  el.style.height = 'auto'
  const newHeight = Math.min(el.scrollHeight, 200)
  el.style.height = newHeight + 'px'
}

function handleLogout() {
  isLoggedIn.value = false
  token.value = ''
  password.value = ''
  activeSessionId.value = null
  activeMeta.value = null
  conversations.value = []
  messages.value = []
  wsConnected.value = false
  localStorage.removeItem(TOKEN_KEY)
  if (ws) {
    ws.close()
    ws = null
  }
}

onMounted(async () => {
  const savedToken = localStorage.getItem(TOKEN_KEY)
  if (savedToken) {
    try {
      const res = await fetch('/api/chat/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: savedToken }),
      })
      const data = await res.json()
      if (res.ok && data.token) {
        token.value = data.token
        isLoggedIn.value = true
        connectWs()
        await loadConversations()
      } else {
        localStorage.removeItem(TOKEN_KEY)
      }
    } catch {
      localStorage.removeItem(TOKEN_KEY)
    }
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
.admin-chat-app {
  height: 100vh;
  background: var(--bg-dark);
  overflow: hidden;
}

/* 登录界面 */
.admin-login-overlay {
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, var(--bg-dark) 0%, var(--bg-darker) 100%);
}

.admin-login-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  padding: 2.5rem;
  width: 100%;
  max-width: 400px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
}

.admin-login-brand {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 2rem;
}

.admin-login-logo {
  width: 48px;
  height: 48px;
  background: linear-gradient(135deg, var(--primary-color) 0%, var(--secondary-color) 100%);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
  font-weight: bold;
  color: white;
}

.admin-login-brand h1 {
  font-size: 1.25rem;
  color: var(--text-primary);
  margin: 0;
}

.admin-login-tagline {
  font-size: 0.875rem;
  color: var(--text-secondary);
  margin: 0.25rem 0 0 0;
}

.form-group {
  margin-bottom: 1.5rem;
}

.form-group label {
  display: block;
  color: var(--text-primary);
  font-size: 0.875rem;
  font-weight: 500;
  margin-bottom: 0.5rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.form-group label i {
  color: var(--primary-color);
}

.form-control {
  width: 100%;
  padding: 0.75rem 1rem;
  background: var(--bg-dark);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  color: var(--text-primary);
  font-size: 0.95rem;
  transition: border-color 0.2s;
}

.form-control:focus {
  outline: none;
  border-color: var(--primary-color);
}

/* 工作区 */
.admin-workspace {
  height: 100vh;
  display: flex;
  flex-direction: column;
}

.admin-bar {
  height: 56px;
  background: var(--bg-card);
  border-bottom: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 1.5rem;
  flex-shrink: 0;
}

.admin-bar-left {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.admin-bar-title {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--text-primary);
}

.admin-ws-pill {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.75rem;
  color: var(--text-secondary);
  padding: 0.25rem 0.625rem;
  background: var(--bg-dark);
  border-radius: 9999px;
}

.admin-ws-pill.connected {
  color: var(--primary-color);
  background: rgba(0, 212, 255, 0.1);
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--border-color);
}

.status-dot.on {
  background: var(--primary-color);
  box-shadow: 0 0 8px rgba(0, 212, 255, 0.5);
}

.btn-logout {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background: transparent;
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-logout:hover {
  background: rgba(239, 68, 68, 0.1);
  border-color: rgba(239, 68, 68, 0.4);
  color: #ef4444;
}

.admin-main {
  flex: 1;
  display: flex;
  overflow: hidden;
}

/* 会话列表 */
.conv-panel {
  width: 320px;
  background: var(--bg-card);
  border-right: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.conv-panel-head {
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--border-color);
}

.conv-head-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.75rem;
}

.conv-head-top span:first-child {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary);
}

.conv-count {
  font-size: 0.75rem;
  color: var(--text-secondary);
  background: var(--bg-dark);
  padding: 0.125rem 0.5rem;
  border-radius: 9999px;
}

.service-filter {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.filter-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.375rem;
  padding: 0.5rem;
  background: var(--bg-dark);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  color: var(--text-secondary);
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.2s;
}

.filter-btn:hover {
  border-color: rgba(0, 212, 255, 0.4);
  color: var(--text-primary);
}

.filter-btn.active {
  background: rgba(0, 212, 255, 0.12);
  border-color: var(--primary-color);
  color: var(--primary-color);
}

.conv-panel-sub {
  font-size: 0.75rem;
  color: var(--text-secondary);
  display: block;
}

.conv-list {
  flex: 1;
  overflow-y: auto;
}

.conv-list::-webkit-scrollbar {
  width: 6px;
}

.conv-list::-webkit-scrollbar-track {
  background: var(--bg-card);
}

.conv-list::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: 3px;
}

.empty-conv {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem 1rem;
  color: var(--text-secondary);
}

.empty-conv i {
  font-size: 2rem;
  margin-bottom: 0.5rem;
  opacity: 0.3;
}

.conv-item {
  display: flex;
  gap: 0.875rem;
  padding: 1rem 1.25rem;
  cursor: pointer;
  border-bottom: 1px solid rgba(42, 47, 74, 0.3);
  transition: background 0.2s;
}

.conv-item:hover {
  background: rgba(0, 212, 255, 0.05);
}

.conv-item.active {
  background: rgba(0, 212, 255, 0.1);
  border-left: 3px solid var(--primary-color);
}

.mini-av {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: bold;
  font-size: 1rem;
  flex-shrink: 0;
}

.conv-item-body {
  flex: 1;
  min-width: 0;
}

.conv-item-top {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.375rem;
}

.conv-item-top strong {
  color: var(--text-primary);
  font-size: 0.95rem;
}

.service-type-badge {
  font-size: 0.625rem;
  padding: 0.125rem 0.375rem;
  border-radius: 4px;
  background: rgba(102, 126, 234, 0.15);
  color: #667eea;
}

.service-type-badge.sales {
  background: rgba(240, 147, 251, 0.15);
  color: #f093fb;
}

.conv-time {
  font-size: 0.7rem;
  color: var(--text-secondary);
  margin-left: auto;
}

.conv-item-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.conv-preview {
  font-size: 0.8rem;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}

.conv-pending {
  font-size: 0.7rem;
  color: var(--primary-color);
  background: rgba(0, 212, 255, 0.1);
  padding: 0.125rem 0.5rem;
  border-radius: 9999px;
  flex-shrink: 0;
}

/* 聊天区域 */
.admin-chat {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--bg-dark);
  min-width: 0;
}

.admin-chat-head {
  height: 64px;
  background: var(--bg-card);
  border-bottom: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  padding: 0 1.5rem;
  flex-shrink: 0;
}

.admin-chat-head-inner {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.admin-chat-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: bold;
  font-size: 1rem;
}

.title-block {
  display: flex;
  flex-direction: column;
}

.admin-chat-title {
  color: var(--text-primary);
  font-weight: 600;
  font-size: 1rem;
}

.admin-chat-meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.25rem;
}

.admin-chat-sub {
  color: var(--text-secondary);
  font-size: 0.75rem;
}

.service-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.7rem;
  padding: 0.125rem 0.5rem;
  border-radius: 9999px;
  background: rgba(102, 126, 234, 0.15);
  color: #667eea;
}

.service-badge.sales {
  background: rgba(240, 147, 251, 0.15);
  color: #f093fb;
}

/* 消息区域 */
.messages {
  flex: 1;
  overflow-y: auto;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
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

/* 每条消息占满一行；客服回复用 row-reverse 时，flex-start 对应靠右对齐（flex-end 会错误地挤到左侧） */
.msg-row {
  display: flex;
  align-items: flex-end;
  gap: 0.75rem;
  width: 100%;
  box-sizing: border-box;
}

.msg-row.them {
  justify-content: flex-start;
}

.msg-row.me {
  flex-direction: row-reverse;
  justify-content: flex-start;
}

.msg-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 0.875rem;
  font-weight: bold;
  flex-shrink: 0;
}

.msg-body {
  display: flex;
  flex-direction: column;
  max-width: 70%;
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
  background: linear-gradient(135deg, #07c160 0%, #059669 100%);
  border: none;
}

.msg-row.me .bubble p {
  color: white;
}

.msg-time {
  font-size: 0.7rem;
  color: var(--text-secondary);
  margin-top: 0.25rem;
}

/* 输入区域 */
.admin-composer {
  padding: 1rem 1.5rem;
  background: var(--bg-card);
  border-top: 1px solid var(--border-color);
  flex-shrink: 0;
}

.admin-input-card {
  max-width: 800px;
  margin: 0 auto;
}

.admin-input-row {
  display: flex;
  gap: 0.75rem;
  align-items: flex-end;
}

.admin-textarea {
  flex: 1;
  padding: 0.75rem 1rem;
  background: var(--bg-dark);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  color: var(--text-primary);
  font-family: inherit;
  font-size: 0.95rem;
  resize: none;
  max-height: 200px;
  min-height: 48px;
  line-height: 1.4;
  transition: border-color 0.2s;
}

.admin-textarea:focus {
  outline: none;
  border-color: var(--primary-color);
}

.admin-textarea:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-send {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.5rem;
  background: linear-gradient(135deg, var(--primary-color) 0%, var(--secondary-color) 100%);
  color: white;
  border: none;
  border-radius: 12px;
  font-size: 0.95rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  height: 48px;
}

.btn-send:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 15px rgba(0, 212, 255, 0.4);
}

.btn-send:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.admin-input-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 0.5rem;
  padding: 0 0.25rem;
}

.admin-input-hint {
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.admin-input-count {
  font-size: 0.75rem;
  color: var(--text-secondary);
}

/* 响应式 */
@media (max-width: 992px) {
  .conv-panel {
    width: 280px;
  }
}

@media (max-width: 768px) {
  .conv-panel {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 100%;
    max-width: 320px;
    z-index: 10;
    transform: translateX(-100%);
    transition: transform 0.3s;
  }
  
  .conv-panel.show {
    transform: translateX(0);
  }
}
</style>
