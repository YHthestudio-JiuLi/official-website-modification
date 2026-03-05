<template>
  <div>
    <AppHeader />
    <main>
      <div class="page-header">
        <div class="container">
          <h1><i class="fas fa-comments"></i> {{ $t('forum.title') }}</h1>
          <p>Share knowledge, exchange experiences, grow together</p>
          <router-link v-if="authStore.isLoggedIn" to="/forum/post" class="btn btn-primary">
            <i class="fas fa-plus"></i> New Post
          </router-link>
          <router-link v-else to="/login" class="btn btn-primary">
            <i class="fas fa-sign-in-alt"></i> Login to Post
          </router-link>
        </div>
      </div>

      <div class="forum-page">
        <div class="container">
          <div v-if="loading" class="loading">{{ $t('common.loading') }}</div>

          <div v-else-if="posts.length === 0" class="empty-state">
            {{ $t('forum.empty') }}
          </div>

          <div v-else class="forum-posts">
            <div
              v-for="post in posts"
              :key="post.id"
              class="forum-post-card"
              :class="{ 'pinned-post': post.isPinned }"
            >
              <div class="post-header">
                <h3>
                  <span v-if="post.isPinned" class="pinned-icon">
                    <i class="fas fa-thumbtack"></i>
                  </span>
                  <router-link :to="`/forum/${post.id}`">{{ post.title }}</router-link>
                </h3>
                <span class="post-date">
                  <i class="fas fa-calendar"></i> {{ post.date }}
                </span>
              </div>
              <div class="post-content">
                <p>{{ post.content }}</p>
              </div>
              <div class="post-footer">
                <span class="post-author">
                  <i class="fas fa-user"></i> {{ post.author }}
                </span>
                <span class="post-replies">
                  <i class="fas fa-comments"></i> {{ post.replies || 0 }} replies
                </span>
                <span class="post-actions">
                  <router-link :to="`/forum/${post.id}`" class="btn btn-secondary btn-sm">
                    View
                  </router-link>
                  <router-link
                    v-if="authStore.isLoggedIn"
                    :to="`/forum/${post.id}#reply`"
                    class="btn btn-primary btn-sm"
                  >
                    <i class="fas fa-reply"></i> Reply
                  </router-link>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
    <AppFooter />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import api from '@/services/api'
import { useAuthStore } from '@/stores/auth'
import AppHeader from '@/components/common/AppHeader.vue'
import AppFooter from '@/components/common/AppFooter.vue'

const authStore = useAuthStore()
const posts = ref([])
const loading = ref(true)

onMounted(async () => {
  try {
    const response = await api.get('/api/forum/posts')
    posts.value = response.data
  } catch (error) {
    console.error('Failed to fetch posts:', error)
  } finally {
    loading.value = false
  }
})
</script>
