<template>
  <div>
    <AppHeader />
    <main>
      <section class="forum-post-hero">
        <div class="container">
          <router-link to="/forum" class="forum-breadcrumb">
            <i class="fas fa-arrow-left" aria-hidden="true" />
            {{ $t('forum.backToForum') }}
          </router-link>
          <h1 class="forum-post-hero__title">
            <i class="fas fa-edit" aria-hidden="true" />
            {{ $t('forum.newPost') }}
          </h1>
        </div>
      </section>

      <div class="forum-post-page">
        <div class="container post-form-container">
          <div v-if="error" class="alert alert-error">
            <i class="fas fa-exclamation-circle" aria-hidden="true" />
            {{ error }}
          </div>

          <form class="post-form" @submit.prevent="handleSubmit">
            <div class="form-group">
              <label for="title">
                <i class="fas fa-heading" aria-hidden="true" />
                {{ $t('forum.postTitle') }}
              </label>
              <input
                id="title"
                v-model="form.title"
                type="text"
                required
                :placeholder="$t('forum.titlePlaceholder')"
              />
            </div>
            <div class="form-group">
              <label for="content">
                <i class="fas fa-align-left" aria-hidden="true" />
                {{ $t('forum.content') }}
              </label>
              <textarea
                id="content"
                v-model="form.content"
                rows="10"
                required
                :placeholder="$t('forum.contentPlaceholder')"
              />
            </div>
            <div class="form-actions">
              <router-link to="/forum" class="btn btn-secondary">
                <i class="fas fa-times" aria-hidden="true" />
                {{ $t('common.cancel') }}
              </router-link>
              <button type="submit" class="btn btn-primary" :disabled="submitting">
                <i class="fas fa-paper-plane" aria-hidden="true" />
                {{ submitting ? $t('forum.posting') : $t('forum.submit') }}
              </button>
            </div>
          </form>
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
import { createForumPost } from '@/services/forum'
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
    await createForumPost(form.value)
    await router.push('/forum')
  } catch (err) {
    error.value =
      err.response?.data?.message ||
      err.response?.data?.error ||
      t('forum.postFailed')
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.forum-post-hero {
  padding: 1.75rem 0 1.25rem;
  background: linear-gradient(135deg, rgba(11, 15, 21, 0.98) 0%, rgba(26, 31, 58, 0.95) 100%);
  border-bottom: 1px solid rgba(0, 212, 255, 0.12);
}

.forum-post-hero__title {
  margin: 0.75rem 0 0;
  font-size: clamp(1.35rem, 3.5vw, 1.75rem);
  color: #e6f1ff;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.forum-post-hero__title i {
  color: #00d4ff;
}

.forum-breadcrumb {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  color: #8892b0;
  text-decoration: none;
  font-size: 0.9rem;
}

.forum-breadcrumb:hover {
  color: #00d4ff;
}

.post-form-container {
  max-width: 800px;
}

.alert-error {
  padding: 0.85rem 1rem;
  border-radius: 8px;
  margin-bottom: 1rem;
  background: rgba(255, 71, 87, 0.1);
  border: 1px solid rgba(255, 71, 87, 0.3);
  color: #ff6b7a;
}

.form-group {
  margin-bottom: 1.25rem;
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

.form-group input,
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
}

.form-group textarea {
  resize: vertical;
  min-height: 200px;
  line-height: 1.65;
}

.form-group input:focus,
.form-group textarea:focus {
  outline: none;
  border-color: #00d4ff;
}

@media (max-width: 640px) {
  .form-actions {
    flex-direction: column;
  }

  .form-actions .btn {
    width: 100%;
    text-align: center;
    justify-content: center;
  }
}
</style>
