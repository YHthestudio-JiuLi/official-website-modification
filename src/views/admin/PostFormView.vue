<template>
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

    <!-- Toast Notification -->
    <div v-if="toast.visible" :class="['toast', 'toast-' + toast.type]">
      <i :class="toast.type === 'success' ? 'fas fa-check-circle' : 'fas fa-exclamation-circle'"></i>
      <span>{{ toast.message }}</span>
    </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { fetchPost, createPost, updatePost } from '@/services/v2/admin/forum'

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

const toast = ref({
  visible: false,
  type: 'success',
  message: ''
})

onMounted(async () => {
  if (isEdit.value) {
    loading.value = true
    try {
      const response = await fetchPost(route.params.id)
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
      await updatePost(route.params.id, form.value)
    } else {
      await createPost(form.value)
    }
    showToast('Post saved successfully', 'success')
    setTimeout(() => {
      router.back()
    }, 1500)
  } catch (err) {
    error.value = err.response?.data?.message || 'Failed to save post'
  } finally {
    submitting.value = false
  }
}

function showToast(message, type = 'success') {
  toast.value = { visible: true, type, message }
  setTimeout(() => {
    toast.value.visible = false
  }, 4000)
}
</script>

<style scoped>
.toast {
  position: fixed;
  bottom: 2rem;
  right: 2rem;
  padding: 1rem 1.5rem;
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  animation: slideInRight 0.3s ease;
  z-index: 2000;
  box-shadow: 0 5px 20px rgba(0, 0, 0, 0.3);
}

.toast.toast-success {
  background: rgba(67, 233, 123, 0.15);
  border: 1px solid #43e97b;
  color: #43e97b;
}

.toast.toast-error {
  background: rgba(245, 87, 108, 0.15);
  border: 1px solid #f5576c;
  color: #f5576c;
}

@keyframes slideInRight {
  from {
    opacity: 0;
    transform: translateX(100px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@media (max-width: 768px) {
  .toast {
    left: 1rem;
    right: 1rem;
    bottom: 1rem;
  }
}
</style>
