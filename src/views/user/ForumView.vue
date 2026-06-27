<template>
  <div class="forum-page-wrap">
    <AppHeader />
    <main>
      <section class="forum-hero">
        <div class="container forum-hero__inner">
          <div class="forum-hero__text">
            <h1 class="forum-hero__title">
              <i class="fas fa-comments" aria-hidden="true" />
              {{ $t('forum.title') }}
            </h1>
            <p class="forum-hero__subtitle">{{ $t('forum.subtitle') }}</p>
          </div>
          <router-link
            v-if="authStore.isLoggedIn"
            to="/forum/post"
            class="btn btn-primary forum-hero__cta"
          >
            <i class="fas fa-plus" aria-hidden="true" />
            {{ $t('forum.newPost') }}
          </router-link>
          <router-link v-else :to="loginRoute" class="btn btn-primary forum-hero__cta">
            <i class="fas fa-sign-in-alt" aria-hidden="true" />
            {{ $t('forum.loginToPost') }}
          </router-link>
        </div>
      </section>

      <div class="forum-page">
        <div class="container forum-page__container">
          <div v-if="loading" class="forum-state">
            <i class="fas fa-spinner fa-spin" aria-hidden="true" />
            {{ $t('common.loading') }}
          </div>

          <div v-else-if="loadError" class="forum-state forum-state--error">
            <i class="fas fa-exclamation-triangle" aria-hidden="true" />
            <p>{{ $t('forum.loadFailed') }}</p>
          </div>

          <div v-else-if="posts.length === 0" class="forum-state forum-state--empty">
            <i class="fas fa-inbox" aria-hidden="true" />
            <p class="forum-state__title">{{ $t('forum.empty') }}</p>
            <p class="forum-state__hint">{{ $t('forum.emptyHint') }}</p>
            <router-link
              v-if="authStore.isLoggedIn"
              to="/forum/post"
              class="btn btn-primary"
            >
              {{ $t('forum.newPost') }}
            </router-link>
          </div>

          <div v-else class="forum-posts">
            <article
              v-for="post in posts"
              :key="post.id"
              class="forum-post-card"
              :class="{ 'pinned-post': post.isPinned }"
            >
              <div class="post-header">
                <h3 class="post-title">
                  <span v-if="post.isPinned" class="pinned-badge">
                    <i class="fas fa-thumbtack" aria-hidden="true" />
                    {{ $t('forum.pinned') }}
                  </span>
                  <router-link :to="`/forum/${post.id}`">{{ post.title }}</router-link>
                </h3>
                <time class="post-date" :datetime="post.date">
                  <i class="fas fa-calendar" aria-hidden="true" />
                  {{ formatPostDate(post.date) }}
                </time>
              </div>
              <p class="post-excerpt">{{ excerpt(post.content) }}</p>
              <div class="post-footer">
                <div class="post-meta">
                  <span class="post-author">
                    <i class="fas fa-user" aria-hidden="true" />
                    {{ post.author }}
                  </span>
                  <span class="post-replies">
                    <i class="fas fa-comments" aria-hidden="true" />
                    {{ $t('forum.repliesCount', { n: post.replies || 0 }) }}
                  </span>
                </div>
                <div class="post-actions">
                  <router-link :to="`/forum/${post.id}`" class="btn btn-secondary btn-sm">
                    {{ $t('forum.viewPost') }}
                  </router-link>
                  <router-link
                    v-if="authStore.isLoggedIn"
                    :to="`/forum/${post.id}#reply`"
                    class="btn btn-primary btn-sm"
                  >
                    <i class="fas fa-reply" aria-hidden="true" />
                    {{ $t('forum.reply') }}
                  </router-link>
                </div>
              </div>
            </article>
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
import { getForumPosts } from '@/services/forum'
import { useAuthStore } from '@/stores/auth'
import { buildLoginRoute, resolveRedirectFromRoute } from '@/utils/authRedirect'
import AppHeader from '@/components/common/AppHeader.vue'
import AppFooter from '@/components/common/AppFooter.vue'

const route = useRoute()
const { locale } = useI18n()
const authStore = useAuthStore()
const loginRoute = computed(() =>
  buildLoginRoute(resolveRedirectFromRoute(route) || '/forum')
)
const posts = ref([])
const loading = ref(true)
const loadError = ref(false)

function excerpt(text, max = 180) {
  if (!text) return ''
  const normalized = String(text).replace(/\s+/g, ' ').trim()
  if (normalized.length <= max) return normalized
  return `${normalized.slice(0, max)}…`
}

function formatPostDate(dateStr) {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  if (Number.isNaN(date.getTime())) return dateStr
  const fmtLocale = locale.value === 'zh' ? 'zh-CN' : 'en-US'
  return date.toLocaleDateString(fmtLocale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

onMounted(async () => {
  try {
    const response = await getForumPosts()
    posts.value = response.data
  } catch (error) {
    console.error('Failed to fetch posts:', error)
    if (error.response?.status !== 401) {
      loadError.value = true
    }
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.forum-hero {
  padding: 2.25rem 0 1.75rem;
  background: linear-gradient(135deg, rgba(11, 15, 21, 0.98) 0%, rgba(26, 31, 58, 0.95) 100%);
  border-bottom: 1px solid rgba(0, 212, 255, 0.12);
}

.forum-hero__inner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 1.25rem;
}

.forum-hero__title {
  margin: 0 0 0.5rem;
  font-size: clamp(1.5rem, 4vw, 2rem);
  color: #e6f1ff;
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.forum-hero__title i {
  color: #00d4ff;
}

.forum-hero__subtitle {
  margin: 0;
  color: #8892b0;
  font-size: 0.98rem;
  line-height: 1.6;
  max-width: 36rem;
}

.forum-hero__cta {
  flex-shrink: 0;
  white-space: nowrap;
}

.forum-page__container {
  max-width: 920px;
}

.forum-state {
  text-align: center;
  padding: 3.5rem 1.25rem;
  color: #8892b0;
}

.forum-state i {
  font-size: 2rem;
  margin-bottom: 0.75rem;
  color: #00d4ff;
  display: block;
}

.forum-state--error i {
  color: #f87171;
}

.forum-state--empty i {
  color: #5a6478;
}

.forum-state__title {
  margin: 0 0 0.35rem;
  font-size: 1.1rem;
  color: #ccd6f6;
}

.forum-state__hint {
  margin: 0 0 1.25rem;
  font-size: 0.92rem;
}

.pinned-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  margin-right: 0.5rem;
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 600;
  color: #00d4ff;
  background: rgba(0, 212, 255, 0.12);
  border: 1px solid rgba(0, 212, 255, 0.28);
  vertical-align: middle;
}

.post-title {
  margin: 0;
  font-size: 1.2rem;
  line-height: 1.45;
  flex: 1;
  min-width: 0;
}

.post-excerpt {
  margin: 0 0 1rem;
  color: #a8b2d1;
  line-height: 1.7;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-word;
}

.post-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.85rem 1.25rem;
  align-items: center;
}

.post-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
  align-items: center;
  margin-left: auto;
}

.post-actions .btn {
  white-space: nowrap;
}

@media (max-width: 768px) {
  .forum-hero {
    padding: 1.5rem 0 1.25rem;
  }

  .forum-hero__inner {
    flex-direction: column;
    align-items: stretch;
  }

  .forum-hero__cta {
    width: 100%;
    text-align: center;
  }

  .post-footer {
    flex-direction: column;
    align-items: stretch;
  }

  .post-actions {
    margin-left: 0;
    width: 100%;
  }

  .post-actions .btn {
    flex: 1 1 auto;
    text-align: center;
    justify-content: center;
  }
}

@media (hover: hover) {
  :deep(.forum-post-card:hover) {
    transform: translateX(6px);
  }
}
</style>
