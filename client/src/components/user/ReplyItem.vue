<template>
  <div class="reply-card" :class="{ 'nested-reply': isChild }">
    <div class="reply-header">
      <div class="reply-author-info">
        <div class="author-avatar-small">
          {{ reply.author ? reply.author.charAt(0).toUpperCase() : '?' }}
        </div>
        <div class="author-details">
          <span class="author-name">{{ reply.author }}</span>
          <span class="reply-date">{{ formatDate(reply.createdAt) }}</span>
        </div>
      </div>
    </div>
    <div class="reply-content">
      <span v-if="reply.parentReplyId && parentReplyAuthor" class="reply-to">
        <i class="fas fa-reply"></i> <strong>{{ parentReplyAuthor }}</strong>
      </span>
      {{ reply.content }}
    </div>
    <div v-if="authStore.isLoggedIn" class="reply-actions">
      <button @click="toggleReplyForm" class="btn-action btn-reply">
        <i class="fas fa-reply"></i> Reply
      </button>
      <button
        v-if="canDelete"
        @click="handleDelete"
        class="btn-action btn-delete"
      >
        <i class="fas fa-trash"></i> Delete
      </button>
    </div>

    <div v-if="showReplyForm" class="nested-reply-form">
      <form @submit.prevent="handleReplyToReply" class="reply-form-inline">
        <div class="form-group">
          <textarea v-model="replyContent" required rows="3" placeholder="Write your reply..."></textarea>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary btn-sm" :disabled="submitting">
            <i class="fas fa-paper-plane"></i> {{ submitting ? 'Posting...' : 'Submit' }}
          </button>
          <button type="button" class="btn btn-secondary btn-sm" @click="cancelReply">
            Cancel
          </button>
        </div>
      </form>
    </div>

    <div v-if="hasChildReplies" class="child-replies-section">
      <button @click="toggleExpand" class="toggle-expand-btn">
        <i class="fas" :class="isExpanded ? 'fa-chevron-up' : 'fa-chevron-down'"></i>
        {{ isExpanded ? 'Collapse Replies' : `${childReplies[reply.id]?.length || 0} Replies` }}
      </button>
      <div v-show="isExpanded" class="child-replies">
        <ReplyItem
          v-for="child in childReplies[reply.id]"
          :key="child.id"
          :reply="child"
          :child-replies="childReplies"
          :post-id="postId"
          :current-user="currentUser"
          :is-child="true"
          @reply-deleted="$emit('reply-deleted')"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import api from '@/services/api'
import { useAuthStore } from '@/stores/auth'

const props = defineProps({
  reply: {
    type: Object,
    required: true
  },
  childReplies: {
    type: Object,
    default: () => ({})
  },
  postId: {
    type: [String, Number],
    required: true
  },
  currentUser: {
    type: String,
    default: ''
  },
  isChild: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['reply-deleted'])

const { t } = useI18n()
const authStore = useAuthStore()
const showReplyForm = ref(false)
const replyContent = ref('')
const submitting = ref(false)
const isExpanded = ref(true)

const parentReplyAuthor = computed(() => {
  if (!props.reply.parentReplyId) return ''
  const parent = Object.values(props.childReplies)
    .flat()
    .find(r => r.id === props.reply.parentReplyId)
  return parent?.author || ''
})

const canDelete = computed(() => {
  return props.currentUser && (props.reply.author === props.currentUser)
})

const hasChildReplies = computed(() => {
  return props.childReplies[props.reply.id]?.length > 0
})

function toggleReplyForm() {
  showReplyForm.value = !showReplyForm.value
  if (showReplyForm.value) {
    isExpanded.value = true
  }
}

function cancelReply() {
  showReplyForm.value = false
  replyContent.value = ''
}

function toggleExpand() {
  isExpanded.value = !isExpanded.value
}

async function handleReplyToReply() {
  submitting.value = true
  try {
    await api.post(`/api/forum/posts/${props.postId}/replies`, {
      content: replyContent.value,
      parentReplyId: props.reply.id
    })
    replyContent.value = ''
    showReplyForm.value = false
    emit('reply-deleted')
  } catch (error) {
    console.error('Failed to post reply:', error)
  } finally {
    submitting.value = false
  }
}

async function handleDelete() {
  if (!confirm('Delete this reply?')) return

  try {
    await api.delete(`/api/forum/replies/${props.reply.id}`)
    emit('reply-deleted')
  } catch (error) {
    console.error('Failed to delete reply:', error)
  }
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return months[date.getMonth()] + ' ' + date.getDate() + ', ' +
    date.getHours().toString().padStart(2, '0') + ':' +
    date.getMinutes().toString().padStart(2, '0')
}
</script>

<style scoped>
.reply-card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(0, 212, 255, 0.1);
  border-radius: 12px;
  padding: 1.25rem;
  margin-bottom: 1rem;
  transition: all 0.3s ease;
}

.reply-card:hover {
  border-color: rgba(0, 212, 255, 0.3);
  background: rgba(255, 255, 255, 0.05);
}

.nested-reply {
  background: rgba(0, 212, 255, 0.05);
  border-color: rgba(0, 212, 255, 0.15);
  margin-left: 0;
}

.reply-header {
  margin-bottom: 0.75rem;
}

.reply-author-info {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.author-avatar-small {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: linear-gradient(135deg, #00d4ff, #0099cc);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  color: #fff;
  font-size: 0.9rem;
  flex-shrink: 0;
}

.author-details {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.author-name {
  font-weight: 600;
  color: #ccd6f6;
  font-size: 0.95rem;
}

.reply-date {
  font-size: 0.8rem;
  color: #8892b0;
}

.reply-content {
  color: #e6f1ff;
  line-height: 1.6;
  margin-bottom: 1rem;
  padding-left: 2.25rem;
}

.reply-to {
  display: block;
  color: #00d4ff;
  margin-bottom: 0.5rem;
  font-size: 0.85rem;
}

.reply-actions {
  display: flex;
  gap: 0.75rem;
  padding-left: 2.25rem;
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}

.btn-action {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 8px;
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-reply {
  background: rgba(0, 212, 255, 0.1);
  color: #00d4ff;
}

.btn-reply:hover {
  background: rgba(0, 212, 255, 0.2);
  transform: translateY(-1px);
}

.btn-delete {
  background: rgba(255, 71, 87, 0.1);
  color: #ff4757;
}

.btn-delete:hover {
  background: rgba(255, 71, 87, 0.2);
  transform: translateY(-1px);
}

.nested-reply-form {
  margin-top: 1rem;
  padding: 1rem;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 8px;
  margin-left: 2.25rem;
}

.reply-form-inline .form-group {
  margin-bottom: 0.75rem;
}

.reply-form-inline textarea {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid rgba(0, 212, 255, 0.2);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.05);
  color: #e6f1ff;
  font-family: inherit;
  font-size: 0.9rem;
  resize: vertical;
  transition: border-color 0.2s;
}

.reply-form-inline textarea:focus {
  outline: none;
  border-color: #00d4ff;
}

.form-actions {
  display: flex;
  gap: 0.5rem;
}

.btn-sm {
  padding: 0.5rem 1rem;
  font-size: 0.85rem;
}

.child-replies-section {
  margin-top: 1rem;
  margin-left: 2.25rem;
}

.toggle-expand-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: rgba(0, 212, 255, 0.08);
  color: #00d4ff;
  border: 1px solid rgba(0, 212, 255, 0.2);
  border-radius: 8px;
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.toggle-expand-btn:hover {
  background: rgba(0, 212, 255, 0.15);
  border-color: #00d4ff;
}

.child-replies {
  margin-top: 1rem;
}

@media (max-width: 640px) {
  .reply-card,
  .nested-reply {
    padding: 1rem;
  }

  .reply-content,
  .reply-actions,
  .nested-reply-form,
  .child-replies-section {
    padding-left: 0;
    margin-left: 0;
  }

  .reply-author-info {
    gap: 0.5rem;
  }

  .author-avatar-small {
    width: 32px;
    height: 32px;
    font-size: 0.85rem;
  }

  .reply-actions {
    flex-wrap: wrap;
  }

  .btn-action {
    padding: 0.4rem 0.75rem;
    font-size: 0.8rem;
  }
}
</style>
