<template>
  <div>
    <AppHeader />
    <main>
      <div class="page-header">
        <div class="container">
          <div class="forum-breadcrumb">
            <router-link to="/forum"><i class="fas fa-arrow-left"></i> Back to Forum</router-link>
          </div>
          <h1><i class="fas fa-comments"></i> {{ post?.title || 'Post Detail' }}</h1>
        </div>
      </div>

      <div class="forum-detail-page">
        <div class="container">
          <div v-if="loading" class="loading">{{ $t('common.loading') }}</div>

          <div v-else-if="loadError" class="load-error">
            <i class="fas fa-exclamation-triangle"></i>
            <p>{{ $t('forum.loadFailed') }}</p>
          </div>

          <div v-else-if="!post" class="empty-state">
            {{ $t('forum.postNotFound') }}
          </div>

          <div v-else class="forum-detail">
            <div class="post-main">
              <div class="post-main-header">
                <div class="post-author-info">
                  <div class="author-avatar">
                    {{ post.author ? post.author.charAt(0).toUpperCase() : '?' }}
                  </div>
                  <div class="author-details">
                    <span class="author-name">{{ post.author }}</span>
                    <span class="post-date">
                      <i class="fas fa-calendar"></i> {{ post.date }}
                    </span>
                  </div>
                </div>
              </div>
              <div class="post-main-content">
                <p>{{ post.content }}</p>
              </div>
              <div class="post-main-footer">
                <span class="replies-count">
                  <i class="fas fa-comments"></i> {{ replies.length }} replies
                </span>
              </div>
            </div>

            <div class="forum-replies-section">
              <h2><i class="fas fa-reply"></i> Replies ({{ replies.length }})</h2>

              <div v-if="replies.length === 0" class="no-replies">
                <i class="fas fa-comment-slash"></i>
                <p>No replies yet, be the first to reply!</p>
              </div>

              <div v-else class="replies-list">
                <ReplyItem
                  v-for="reply in topLevelReplies"
                  :key="reply.id"
                  :reply="reply"
                  :child-replies="childRepliesMap"
                  :all-replies="replies"
                  :post-id="post.id"
                  :current-user="authStore.username"
                  @reply-deleted="fetchData"
                />
              </div>
            </div>

            <div v-if="authStore.isLoggedIn" class="reply-form-section" id="reply">
              <h3><i class="fas fa-edit"></i> Post Reply</h3>
              <div v-if="error" class="alert alert-error">
                <i class="fas fa-exclamation-circle"></i> {{ error }}
              </div>
              <form @submit.prevent="handleReply" class="reply-form">
                <div class="form-group">
                  <label for="reply-content">
                    <i class="fas fa-comment"></i> Reply Content
                  </label>
                  <textarea
                    id="reply-content"
                    v-model="replyContent"
                    rows="5"
                    required
                    placeholder="Enter your reply content..."
                  ></textarea>
                </div>
                <button type="submit" class="btn btn-primary" :disabled="submitting">
                  <i class="fas fa-paper-plane"></i> {{ submitting ? $t('common.loading') : 'Submit Reply' }}
                </button>
              </form>
            </div>

            <div v-else class="reply-login-prompt">
              <p>
                <i class="fas fa-info-circle"></i>
                Please <router-link :to="loginRoute">login</router-link> to reply
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
    <AppFooter />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import api from '@/services/api'
import { useAuthStore } from '@/stores/auth'
import { buildLoginRoute } from '@/utils/authRedirect'
import AppHeader from '@/components/common/AppHeader.vue'
import AppFooter from '@/components/common/AppFooter.vue'
import ReplyItem from '@/components/user/ReplyItem.vue'

const route = useRoute()
const authStore = useAuthStore()

const loginRoute = computed(() => {
  const id = route.params.id
  const path = id ? `/forum/${id}` : '/forum'
  return buildLoginRoute(path)
})

const post = ref(null)
const replies = ref([])
const replyContent = ref('')
const error = ref('')
const loading = ref(true)
const loadError = ref(false)
const submitting = ref(false)

const topLevelReplies = computed(() => {
  return replies.value.filter(r => !r.parentReplyId)
})

const childRepliesMap = computed(() => {
  const map = {}
  replies.value.forEach(reply => {
    if (reply.parentReplyId) {
      if (!map[reply.parentReplyId]) {
        map[reply.parentReplyId] = []
      }
      map[reply.parentReplyId].push(reply)
    }
  })
  return map
})

onMounted(fetchData)

async function fetchData() {
  loading.value = true
  loadError.value = false
  try {
    const [postRes, repliesRes] = await Promise.all([
      api.get(`/api/forum/posts/${route.params.id}`),
      api.get(`/api/forum/posts/${route.params.id}/replies`)
    ])
    post.value = postRes.data
    replies.value = repliesRes.data
  } catch (error) {
    console.error('Failed to fetch data:', error)
    const status = error.response?.status
    if (status === 401) return
    if (status !== 404) {
      loadError.value = true
    }
    post.value = null
    replies.value = []
  } finally {
    loading.value = false
  }
}

async function handleReply() {
  submitting.value = true
  error.value = ''
  try {
    await api.post(`/api/forum/posts/${route.params.id}/replies`, {
      content: replyContent.value
    })
    replyContent.value = ''
    await fetchData()
  } catch (err) {
    error.value = err.response?.data?.message || err.response?.data?.error || 'Failed to post reply'
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.page-header {
  background: linear-gradient(135deg, #0f1222 0%, #1a1f3a 100%);
  padding: 2rem 0;
  border-bottom: 1px solid rgba(0, 212, 255, 0.1);
}

.page-header h1 {
  color: #e6f1ff;
  font-size: 1.75rem;
  margin: 1rem 0 0 0;
}

.page-header i {
  color: #00d4ff;
  margin-right: 0.5rem;
}

.forum-breadcrumb a {
  color: #8892b0;
  text-decoration: none;
  font-size: 0.9rem;
  transition: color 0.2s;
}

.forum-breadcrumb a:hover {
  color: #00d4ff;
}

.forum-breadcrumb i {
  margin-right: 0.5rem;
}

.forum-detail-page {
  min-height: 60vh;
  padding: 2rem 0;
}

.container {
  max-width: 900px;
  margin: 0 auto;
  padding: 0 2rem;
}

.loading {
  text-align: center;
  color: #8892b0;
  padding: 3rem;
}

.load-error {
  text-align: center;
  color: #8892b0;
  padding: 3rem;
}

.load-error i {
  font-size: 48px;
  margin-bottom: 16px;
  color: #f87171;
  display: block;
}

.empty-state {
  text-align: center;
  color: #8892b0;
  padding: 3rem;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
}

.post-main {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(0, 212, 255, 0.15);
  border-radius: 12px;
  padding: 1.5rem;
  margin-bottom: 2rem;
}

.post-main-header {
  margin-bottom: 1rem;
}

.post-author-info {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.author-avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: linear-gradient(135deg, #00d4ff, #0099cc);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  color: #fff;
  font-size: 1.2rem;
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
  font-size: 1rem;
}

.post-date {
  font-size: 0.85rem;
  color: #8892b0;
}

.post-date i {
  margin-right: 0.5rem;
  color: #00d4ff;
}

.post-main-content {
  color: #e6f1ff;
  line-height: 1.8;
  padding: 1rem 0;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  white-space: pre-wrap;
  word-break: break-word;
}

.post-main-footer {
  padding-top: 1rem;
}

.replies-count {
  color: #8892b0;
  font-size: 0.9rem;
}

.replies-count i {
  color: #00d4ff;
  margin-right: 0.5rem;
}

.forum-replies-section {
  margin-bottom: 2rem;
}

.forum-replies-section h2 {
  color: #ccd6f6;
  font-size: 1.25rem;
  margin-bottom: 1.5rem;
}

.forum-replies-section h2 i {
  color: #00d4ff;
  margin-right: 0.5rem;
}

.no-replies {
  text-align: center;
  color: #8892b0;
  padding: 3rem;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 12px;
  border: 1px dashed rgba(255, 255, 255, 0.1);
}

.no-replies i {
  font-size: 2rem;
  display: block;
  margin-bottom: 1rem;
  color: #5a6478;
}

.replies-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.reply-form-section h3 {
  color: #ccd6f6;
  font-size: 1.1rem;
  margin-bottom: 1.5rem;
}

.reply-form-section h3 i {
  color: #00d4ff;
  margin-right: 0.5rem;
}

.alert {
  padding: 1rem;
  border-radius: 8px;
  margin-bottom: 1rem;
}

.alert-error {
  background: rgba(255, 71, 87, 0.1);
  border: 1px solid rgba(255, 71, 87, 0.3);
  color: #ff4757;
}

.alert-error i {
  margin-right: 0.5rem;
}

.reply-form {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(0, 212, 255, 0.15);
  border-radius: 12px;
  padding: 1.5rem;
}

.form-group {
  margin-bottom: 1rem;
}

.form-group label {
  display: block;
  color: #ccd6f6;
  font-weight: 500;
  margin-bottom: 0.75rem;
}

.form-group label i {
  color: #00d4ff;
  margin-right: 0.5rem;
}

.form-group textarea {
  width: 100%;
  padding: 1rem;
  border: 1px solid rgba(0, 212, 255, 0.2);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.05);
  color: #e6f1ff;
  font-family: inherit;
  font-size: 0.95rem;
  resize: vertical;
  transition: border-color 0.2s;
}

.form-group textarea:focus {
  outline: none;
  border-color: #00d4ff;
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.reply-login-prompt {
  text-align: center;
  color: #8892b0;
  padding: 2rem;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 12px;
  border: 1px dashed rgba(255, 255, 255, 0.1);
}

.reply-login-prompt a {
  color: #00d4ff;
  text-decoration: none;
  font-weight: 500;
}

.reply-login-prompt a:hover {
  text-decoration: underline;
}

.reply-login-prompt i {
  color: #00d4ff;
  margin-right: 0.5rem;
}

@media (max-width: 640px) {
  .page-header {
    padding: 1.5rem 0;
  }

  .page-header h1 {
    font-size: 1.25rem;
  }

  .container {
    padding: 0 1rem;
  }

  .post-main {
    padding: 1rem;
  }

  .author-avatar {
    width: 40px;
    height: 40px;
    font-size: 1rem;
  }

  .reply-form {
    padding: 1rem;
  }
}
</style>
