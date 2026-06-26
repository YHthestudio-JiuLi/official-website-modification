<template>
  <div>
    <AppHeader />
    <main>
      <div class="page-header">
        <div class="container">
          <h1><i class="fas fa-edit"></i> {{ $t('forum.newPost') }}</h1>
        </div>
      </div>

      <div class="forum-post-page">
        <div class="container">
          <div v-if="error" class="alert alert-error">
            <i class="fas fa-exclamation-circle"></i> {{ error }}
          </div>

          <div class="post-form-container">
            <form @submit.prevent="handleSubmit" class="post-form">
              <div class="form-group">
                <label for="title">
                  <i class="fas fa-heading"></i> {{ $t('forum.postTitle') }}
                </label>
                <input
                  type="text"
                  id="title"
                  v-model="form.title"
                  required
                  placeholder="Enter post title"
                />
              </div>
              <div class="form-group">
                <label for="content">
                  <i class="fas fa-align-left"></i> {{ $t('forum.content') }}
                </label>
                <textarea
                  id="content"
                  v-model="form.content"
                  rows="10"
                  required
                  placeholder="Enter post content..."
                ></textarea>
              </div>
              <div class="form-actions">
                <router-link to="/forum" class="btn btn-secondary">
                  <i class="fas fa-times"></i> {{ $t('common.cancel') }}
                </router-link>
                <button type="submit" class="btn btn-primary" :disabled="submitting">
                  <i class="fas fa-paper-plane"></i> {{ submitting ? $t('common.loading') : $t('forum.submit') }}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </main>
    <AppFooter />
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import api from '@/services/api'
import AppHeader from '@/components/common/AppHeader.vue'
import AppFooter from '@/components/common/AppFooter.vue'

const router = useRouter()
const { t } = useI18n()

const form = ref({
  title: '',
  content: ''
})
const submitting = ref(false)
const error = ref('')

async function handleSubmit() {
  submitting.value = true
  error.value = ''
  try {
    await api.post('/api/forum/posts', form.value)
    await router.push('/forum')
  } catch (err) {
    error.value =
      err.response?.data?.message ||
      err.response?.data?.error ||
      t('common.unknownError')
  } finally {
    submitting.value = false
  }
}
</script>
