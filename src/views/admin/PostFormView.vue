<template>
  <AdminLayout>
    <div class="post-form-page">
      <div class="admin-page-header">
        <h2>
          <i class="fas fa-comments"></i>
          {{ isEdit ? 'Edit Post' : 'Add Post' }}
        </h2>
        <router-link to="/admin/posts" class="btn btn-secondary">
          <i class="fas fa-arrow-left"></i> Back to List
        </router-link>
      </div>

      <div v-if="loading" class="loading">{{ $t('common.loading') }}</div>

      <div v-else class="admin-form-container">
        <form @submit.prevent="handleSubmit" class="admin-form">
          <div v-if="error" class="alert alert-error">
            <i class="fas fa-exclamation-circle"></i> {{ error }}
          </div>

          <div class="form-group">
            <label for="title">
              <i class="fas fa-heading"></i> Title *
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
            <label for="author">
              <i class="fas fa-user"></i> Author
            </label>
            <input
              type="text"
              id="author"
              v-model="form.author"
              placeholder="Enter author name"
            />
          </div>

          <div class="form-group">
            <label for="content">
              <i class="fas fa-align-left"></i> Content *
            </label>
            <textarea
              id="content"
              v-model="form.content"
              rows="10"
              required
              placeholder="Enter post content..."
            ></textarea>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label for="date">
                <i class="fas fa-calendar"></i> Date *
              </label>
              <input
                type="date"
                id="date"
                v-model="form.date"
                required
              />
            </div>
          </div>

          <div class="form-actions">
            <router-link to="/admin/posts" class="btn btn-secondary">
              <i class="fas fa-times"></i> Cancel
            </router-link>
            <button type="submit" class="btn btn-primary" :disabled="submitting">
              <i class="fas fa-save"></i> {{ submitting ? $t('common.loading') : 'Save' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </AdminLayout>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '@/services/api'
import AdminLayout from '@/components/admin/AdminLayout.vue'

const route = useRoute()
const router = useRouter()

const isEdit = computed(() => route.name === 'admin-post-edit')

const form = ref({
  title: '',
  author: '',
  content: '',
  date: new Date().toISOString().split('T')[0]
})
const loading = ref(false)
const submitting = ref(false)
const error = ref('')

onMounted(async () => {
  if (isEdit.value) {
    loading.value = true
    try {
      const response = await api.get(`/api/admin/posts/${route.params.id}`)
      form.value = {
        title: response.data.title,
        author: response.data.author || '',
        content: response.data.content,
        date: response.data.date || new Date().toISOString().split('T')[0]
      }
    } catch (err) {
      console.error('Failed to fetch post:', err)
      router.push('/admin/posts')
    } finally {
      loading.value = false
    }
  }
})

async function handleSubmit() {
  submitting.value = true
  error.value = ''

  try {
    if (isEdit.value) {
      await api.put(`/api/admin/posts/${route.params.id}`, form.value)
    } else {
      await api.post('/api/admin/posts', form.value)
    }
    router.push('/admin/posts')
  } catch (err) {
    error.value = err.response?.data?.message || 'Failed to save post'
  } finally {
    submitting.value = false
  }
}
</script>
