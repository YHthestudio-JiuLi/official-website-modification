<template>
  <div>
    <AppHeader />
    <main>
      <section class="forum-detail-hero">
        <div class="container forum-detail-hero__inner">
          <router-link to="/forum" class="forum-breadcrumb">
            <i class="fas fa-arrow-left" aria-hidden="true" />
            {{ $t('forum.backToForum') }}
          </router-link>
          <h1 v-if="post" class="forum-detail-hero__title">
            <span v-if="post.isPinned" class="pinned-badge">
              <i class="fas fa-thumbtack" aria-hidden="true" />
              {{ $t('forum.pinned') }}
            </span>
            {{ post.title }}
          </h1>
          <h1 v-else class="forum-detail-hero__title">{{ $t('forum.postDetail') }}</h1>
        </div>
      </section>

      <div class="forum-detail-page">
        <div class="container forum-detail-page__container">
          <div v-if="loading" class="forum-state">
            <i class="fas fa-spinner fa-spin" aria-hidden="true" />
            {{ $t('common.loading') }}
          </div>

          <div v-else-if="loadError" class="forum-state forum-state--error">
            <i class="fas fa-exclamation-triangle" aria-hidden="true" />
            <p>{{ $t('forum.loadFailed') }}</p>
          </div>

          <div v-else-if="!post" class="forum-state forum-state--empty">
            <i class="fas fa-file-circle-xmark" aria-hidden="true" />
            <p>{{ $t('forum.postNotFound') }}</p>
            <router-link to="/forum" class="btn btn-secondary">{{ $t('forum.backToForum') }}</router-link>
          </div>

          <div v-else class="forum-detail">
            <article class="post-main">
              <div class="post-main-header">
                <div class="post-author-info">
                  <div class="author-avatar">
                    {{ post.author ? post.author.charAt(0).toUpperCase() : '?' }}
                  </div>
                  <div class="author-details">
                    <span class="author-name">{{ post.author }}</span>
                    <time class="post-date" :datetime="post.date">
                      <i class="fas fa-calendar" aria-hidden="true" />
                      {{ formatDate(post.date) }}
                    </time>
                  </div>
                </div>
              </div>
              <div class="post-main-content">
                <p>{{ post.content }}</p>
              </div>
              <div class="post-main-footer">
                <span class="replies-count">
                  <i class="fas fa-comments" aria-hidden="true" />
                  {{ $t('forum.repliesCount', { n: replies.length }) }}
                </span>
              </div>
            </article>

            <section class="forum-replies-section">
              <h2>
                <i class="fas fa-reply" aria-hidden="true" />
                {{ $t('forum.replySectionCount', { n: replies.length }) }}
              </h2>

              <div v-if="replies.length === 0" class="no-replies">
                <i class="fas fa-comment-slash" aria-hidden="true" />
                <p>{{ $t('forum.noReplies') }}</p>
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
            </section>

            <section v-if="authStore.isLoggedIn" class="reply-form-section" id="reply">
              <h3>
                <i class="fas fa-edit" aria-hidden="true" />
                {{ $t('forum.postReply') }}
              </h3>
              <div v-if="error" class="alert alert-error">
                <i class="fas fa-exclamation-circle" aria-hidden="true" />
                {{ error }}
              </div>
              <form class="reply-form" @submit.prevent="handleReply">
                <div class="form-group">
                  <label for="reply-content">
                    <i class="fas fa-comment" aria-hidden="true" />
                    {{ $t('forum.replyContent') }}
                  </label>
                  <textarea
                    id="reply-content"
                    v-model="replyContent"
                    rows="5"
                    required
                    :placeholder="$t('forum.replyPlaceholder')"
                  />
                </div>
                <button type="submit" class="btn btn-primary" :disabled="submitting">
                  <i class="fas fa-paper-plane" aria-hidden="true" />
                  {{ submitting ? $t('forum.posting') : $t('forum.submitReply') }}
                </button>
              </form>
            </section>

            <div v-else class="reply-login-prompt">
              <p>
                <i class="fas fa-info-circle" aria-hidden="true" />
                <i18n-t keypath="forum.loginPrompt" tag="span">
                  <template #link>
                    <router-link :to="loginRoute">{{ $t('nav.login') }}</router-link>
                  </template>
                </i18n-t>
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
import { useI18n } from 'vue-i18n'
import { getForumPost, getForumReplies, createForumReply } from '@/services/forum'
import { useAuthStore } from '@/stores/auth'
import { buildLoginRoute } from '@/utils/authRedirect'
import AppHeader from '@/components/common/AppHeader.vue'
import AppFooter from '@/components/common/AppFooter.vue'
import ReplyItem from '@/components/user/ReplyItem.vue'

const route = useRoute()
const { t, locale } = useI18n()
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

const topLevelReplies = computed(() => replies.value.filter((r) => !r.parentReplyId))

const childRepliesMap = computed(() => {
  const map = {}
  replies.value.forEach((reply) => {
    if (reply.parentReplyId) {
      if (!map[reply.parentReplyId]) map[reply.parentReplyId] = []
      map[reply.parentReplyId].push(reply)
    }
  })
  return map
})

function formatDate(dateStr) {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  if (Number.isNaN(date.getTime())) return dateStr
  const fmtLocale = locale.value === 'zh' ? 'zh-CN' : 'en-US'
  return date.toLocaleString(fmtLocale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

onMounted(fetchData)

async function fetchData() {
  loading.value = true
  loadError.value = false
  try {
    const [postRes, repliesRes] = await Promise.all([
      getForumPost(route.params.id),
      getForumReplies(route.params.id)
    ])
    post.value = postRes.data
    replies.value = repliesRes.data
  } catch (err) {
    console.error('Failed to fetch data:', err)
    const status = err.response?.status
    if (status === 401) return
    if (status !== 404) loadError.value = true
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
    await createForumReply(route.params.id, { content: replyContent.value })
    replyContent.value = ''
    await fetchData()
  } catch (err) {
    error.value =
      err.response?.data?.message ||
      err.response?.data?.error ||
      t('forum.replyFailed')
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.forum-detail-hero {
  padding: 1.75rem 0 1.25rem;
  background: linear-gradient(135deg, rgba(11, 15, 21, 0.98) 0%, rgba(26, 31, 58, 0.95) 100%);
  border-bottom: 1px solid rgba(0, 212, 255, 0.12);
}

.forum-detail-hero__title {
  margin: 0.85rem 0 0;
  font-size: clamp(1.25rem, 3.5vw, 1.75rem);
  line-height: 1.4;
  color: #e6f1ff;
  word-break: break-word;
}

.forum-breadcrumb {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  color: #8892b0;
  text-decoration: none;
  font-size: 0.9rem;
  transition: color 0.2s;
}

.forum-breadcrumb:hover {
  color: #00d4ff;
}

.pinned-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  margin-right: 0.45rem;
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 600;
  color: #00d4ff;
  background: rgba(0, 212, 255, 0.12);
  border: 1px solid rgba(0, 212, 255, 0.28);
  vertical-align: middle;
}

.forum-detail-page__container {
  max-width: 900px;
}

.forum-state {
  text-align: center;
  padding: 3rem 1rem;
  color: #8892b0;
}

.forum-state i {
  font-size: 2rem;
  display: block;
  margin-bottom: 0.75rem;
  color: #00d4ff;
}

.forum-state--error i {
  color: #f87171;
}

.forum-state--empty i {
  color: #5a6478;
}

.post-main {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(0, 212, 255, 0.15);
  border-radius: 12px;
  padding: 1.5rem;
  margin-bottom: 2rem;
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
  min-width: 0;
}

.author-name {
  font-weight: 600;
  color: #ccd6f6;
}

.post-date {
  font-size: 0.85rem;
  color: #8892b0;
}

.post-date i {
  margin-right: 0.35rem;
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

.replies-count {
  color: #8892b0;
  font-size: 0.9rem;
}

.replies-count i {
  color: #00d4ff;
  margin-right: 0.35rem;
}

.forum-replies-section h2 {
  color: #ccd6f6;
  font-size: 1.2rem;
  margin-bottom: 1.25rem;
  display: flex;
  align-items: center;
  gap: 0.45rem;
}

.forum-replies-section h2 i {
  color: #00d4ff;
}

.no-replies {
  text-align: center;
  color: #8892b0;
  padding: 2.5rem 1rem;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 12px;
  border: 1px dashed rgba(255, 255, 255, 0.1);
}

.no-replies i {
  font-size: 2rem;
  display: block;
  margin-bottom: 0.75rem;
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
  margin-bottom: 1rem;
  display: flex;
  align-items: center;
  gap: 0.45rem;
}

.reply-form-section h3 i {
  color: #00d4ff;
}

.alert-error {
  padding: 0.85rem 1rem;
  border-radius: 8px;
  margin-bottom: 1rem;
  background: rgba(255, 71, 87, 0.1);
  border: 1px solid rgba(255, 71, 87, 0.3);
  color: #ff6b7a;
}

.reply-form {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(0, 212, 255, 0.15);
  border-radius: 12px;
  padding: 1.25rem;
}

.form-group label {
  display: block;
  color: #ccd6f6;
  font-weight: 500;
  margin-bottom: 0.65rem;
}

.form-group label i {
  color: #00d4ff;
  margin-right: 0.35rem;
}

.form-group textarea {
  width: 100%;
  box-sizing: border-box;
  padding: 0.85rem 1rem;
  border: 1px solid rgba(0, 212, 255, 0.2);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.05);
  color: #e6f1ff;
  font-family: inherit;
  font-size: 0.95rem;
  resize: vertical;
  min-height: 120px;
}

.form-group textarea:focus {
  outline: none;
  border-color: #00d4ff;
}

.reply-login-prompt {
  text-align: center;
  color: #8892b0;
  padding: 1.75rem 1rem;
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
  margin-right: 0.35rem;
}

@media (max-width: 640px) {
  .forum-detail-hero {
    padding: 1.25rem 0 1rem;
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
