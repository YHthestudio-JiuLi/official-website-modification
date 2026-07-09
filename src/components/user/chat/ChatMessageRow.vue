<template>
  <div class="msg-row" :class="{ me: isUserSender, them: !isUserSender }">
    <div class="msg-avatar" :style="{ background: avatarBackgroundColor }">
      {{ CHAT_AVATAR_TEXT }}
    </div>
    <div class="msg-body">
      <div class="bubble">
        <p>{{ message.body }}</p>
      </div>
      <div class="msg-time">{{ formattedTime }}</div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { CHAT_AVATAR_TEXT } from '@/constants/chatUi'

const props = defineProps({
  message: {
    type: Object,
    required: true
  },
  adminAvatarColor: {
    type: String,
    default: ''
  }
})

const isUserSender = computed(() => props.message?.sender === 'user')

const avatarBackgroundColor = computed(() => {
  if (isUserSender.value) {
    return 'var(--primary-color)'
  }
  return props.adminAvatarColor || '#07c160'
})

const formattedTime = computed(() => formatTime(props.message?.created_at))

function parseServerDateTime(value) {
  if (!value) return null
  let normalized = String(value).trim()
  if (!normalized) return null
  normalized = normalized.replace(' ', 'T')
  if (!/[zZ]$/.test(normalized) && !/[+-]\d{2}:?\d{2}$/.test(normalized)) {
    normalized += 'Z'
  }
  const parsed = new Date(normalized)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function formatTime(value) {
  const parsed = parseServerDateTime(value)
  if (!parsed) return value ? String(value) : ''
  return parsed.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}
</script>

<style scoped>
/* 消息行：满宽以便「自己发的消息」在 row-reverse 下靠右对齐 */
.msg-row {
  display: flex;
  align-items: flex-end;
  gap: 0.75rem;
  width: 100%;
  box-sizing: border-box;
  animation: fadeIn 0.3s ease;
}

.msg-row.them {
  justify-content: flex-start;
}

.msg-row.me {
  flex-direction: row-reverse;
  justify-content: flex-start;
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

@media (max-width: 640px) {
  .msg-body {
    max-width: 85%;
  }
}
</style>
