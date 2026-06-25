<template>
  <div class="posts-page">
      <div class="page-header">
        <div class="header-content">
          <h2><i class="fas fa-comments"></i> {{ $t('admin.posts.listTitle') }}</h2>
          <p>{{ $t('admin.posts.subtitle') }}</p>
        </div>
        <router-link to="/admin/posts/add" class="btn btn-primary">
          <i class="fas fa-plus"></i> {{ $t('admin.posts.addPost') }}
        </router-link>
      </div>

      <div v-if="loading" class="loading-container">
        <div class="loading-spinner">
          <i class="fas fa-spinner fa-spin"></i>
          <span>{{ $t('admin.posts.loading') }}</span>
        </div>
      </div>

      <div v-else class="table-card">
        <div class="table-header">
          <div class="table-info">
            <i class="fas fa-newspaper"></i>
            <span>{{ $t('admin.posts.totalCount', { count: posts.length }) }}</span>
          </div>
        </div>
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>{{ $t('admin.posts.id') }}</th>
                <th>{{ $t('admin.posts.postTitle') }}</th>
                <th>{{ $t('admin.posts.author') }}</th>
                <th>{{ $t('admin.posts.date') }}</th>
                <th>{{ $t('admin.posts.replies') }}</th>
                <th>{{ $t('admin.orders.status') }}</th>
                <th class="text-center">{{ $t('admin.posts.actions') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="post in posts" :key="post.id" :class="{ 'pinned-row': post.isPinned }">
                <td>
                  <span class="id-badge">#{{ post.id }}</span>
                </td>
                <td>
                  <div class="title-cell">
                    <span v-if="post.isPinned" class="pinned-icon" :title="$t('admin.posts.pinnedPost')">
                      <i class="fas fa-thumbtack"></i>
                    </span>
                    <span class="title-text">{{ truncateTitle(post.title) }}</span>
                  </div>
                </td>
                <td>
                  <span class="author-cell">
                    <i class="fas fa-user"></i>
                    {{ post.author }}
                  </span>
                </td>
                <td>
                  <span class="date-cell">{{ post.date }}</span>
                </td>
                <td>
                  <span class="replies-badge">
                    <i class="fas fa-comments"></i>
                    {{ post.replies || 0 }}
                  </span>
                </td>
                <td>
                  <span :class="['status-badge', post.isPinned ? 'status-pinned' : 'status-normal']">
                    <i :class="post.isPinned ? 'fas fa-thumbtack' : 'fas fa-check'"></i>
                    {{ post.isPinned ? $t('admin.posts.statusPinned') : $t('admin.posts.statusNormal') }}
                  </span>
                </td>
                <td class="actions-cell">
                  <div class="action-buttons" role="group" :aria-label="`${$t('admin.posts.actions')}: ${post.title}`">
                    <button
                      @click="handlePin(post.id, post.isPinned)"
                      :class="['btn-icon action-btn', post.isPinned ? 'btn-warning' : 'btn-info']"
                      :title="post.isPinned ? $t('admin.posts.unpin') : $t('admin.posts.pin')"
                    >
                      <i class="fas fa-thumbtack"></i>
                      <span class="action-label">{{ post.isPinned ? $t('admin.posts.unpin') : $t('admin.posts.pin') }}</span>
                    </button>
                    <router-link
                      :to="`/admin/posts/edit/${post.id}`"
                      class="btn-icon action-btn btn-edit"
                      :title="$t('admin.posts.edit')"
                    >
                      <i class="fas fa-edit"></i>
                      <span class="action-label">{{ $t('admin.posts.edit') }}</span>
                    </router-link>
                    <button
                      @click="confirmDelete(post.id, post.title)"
                      class="btn-icon action-btn btn-delete"
                      :title="$t('admin.posts.delete')"
                    >
                      <i class="fas fa-trash"></i>
                      <span class="action-label">{{ $t('admin.posts.delete') }}</span>
                    </button>
                    <button
                      @click="openRepliesModal(post)"
                      class="btn-icon action-btn btn-replies"
                      :title="$t('admin.posts.replies')"
                    >
                      <i class="fas fa-comments"></i>
                      <span class="action-label">{{ $t('admin.posts.replies') }}</span>
                    </button>
                  </div>
                </td>
              </tr>
              <tr v-if="posts.length === 0">
                <td colspan="7" class="empty-state">
                  <i class="fas fa-inbox"></i>
                  <p>{{ $t('admin.posts.empty') }}</p>
                  <router-link to="/admin/posts/add" class="btn btn-primary btn-sm">
                    <i class="fas fa-plus"></i> {{ $t('admin.posts.addFirstPost') }}
                  </router-link>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="scroll-indicator">
          <i class="fas fa-arrows-alt-h"></i>
          <span>{{ $t('admin.posts.scrollHint') }}</span>
        </div>
      </div>

      <!-- Delete Confirmation Modal -->
      <div v-if="showDeleteModal" class="modal-overlay" @click="closeDeleteModal">
        <div class="modal-container" @click.stop>
          <div class="modal-header">
            <i class="fas fa-exclamation-triangle"></i>
            <h3>{{ $t('admin.posts.confirmDeleteTitle') }}</h3>
          </div>
          <div class="modal-body">
            <p>{{ $t('admin.posts.confirmDelete') }}</p>
            <p class="post-title"><strong>"{{ postToDelete?.title }}"</strong></p>
            <p class="warning-text">
              <i class="fas fa-exclamation-circle"></i>
              {{ $t('admin.posts.deleteWarning') }}
            </p>
          </div>
          <div class="modal-footer">
            <button @click="closeDeleteModal" class="btn btn-secondary">
              <i class="fas fa-times"></i> {{ $t('admin.posts.cancel') }}
            </button>
            <button @click="executeDelete" class="btn btn-danger">
              <i class="fas fa-trash"></i> {{ $t('admin.posts.deletePost') }}
            </button>
          </div>
        </div>
      </div>

      <div v-if="showRepliesModal" class="modal-overlay" @click="closeRepliesModal">
        <div class="modal-container replies-modal" @click.stop>
          <div class="modal-header">
            <i class="fas fa-comments"></i>
            <h3>{{ $t('admin.posts.manageReplies') }}</h3>
          </div>
          <div class="modal-body">
            <p class="post-title"><strong>{{ repliesPost?.title || '-' }}</strong></p>
            <div v-if="repliesLoading" class="loading-inline">
              <i class="fas fa-spinner fa-spin"></i> {{ $t('admin.posts.loadingReplies') }}
            </div>
            <div v-else-if="replies.length === 0" class="empty-replies">
              {{ $t('admin.posts.noReplies') }}
            </div>
            <div v-else class="replies-list">
              <div v-for="reply in replies" :key="reply.id" class="reply-item">
                <div class="reply-meta">
                  <span>#{{ reply.id }} · {{ reply.author }}</span>
                  <span>{{ reply.createdAt }}</span>
                </div>
                <div class="reply-content">{{ reply.content }}</div>
                <button class="btn-icon action-btn btn-delete" @click="deleteReply(reply.id)">
                  <i class="fas fa-trash"></i>
                  <span class="action-label">{{ $t('admin.posts.delete') }}</span>
                </button>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button @click="closeRepliesModal" class="btn btn-secondary">
              <i class="fas fa-times"></i> {{ $t('common.close') }}
            </button>
          </div>
        </div>
      </div>
    </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  fetchPosts,
  pinPost,
  deletePost,
  fetchReplies,
  deleteReply as deleteReplyApi
} from '@/services/v2/admin/forum'

const { t } = useI18n()
const posts = ref([])
const loading = ref(true)

const showDeleteModal = ref(false)
const postToDelete = ref(null)
const showRepliesModal = ref(false)
const repliesPost = ref(null)
const replies = ref([])
const repliesLoading = ref(false)

onMounted(loadPosts)

async function loadPosts() {
  loading.value = true
  try {
    const response = await fetchPosts()
    posts.value = response.data
  } catch (error) {
    console.error('Failed to fetch posts:', error)
  } finally {
    loading.value = false
  }
}

async function handlePin(id, isPinned) {
  const action = isPinned ? 'unpin' : 'pin'
  try {
    await pinPost(id)
    await loadPosts()
  } catch (error) {
    console.error('Failed to toggle pin:', error)
  }
}

function confirmDelete(id, title) {
  const post = posts.value.find(p => p.id === id)
  postToDelete.value = post
  showDeleteModal.value = true
}

function closeDeleteModal() {
  showDeleteModal.value = false
  postToDelete.value = null
}

async function executeDelete() {
  if (!postToDelete.value) return

  try {
    await deletePost(postToDelete.value.id)
    await loadPosts()
    closeDeleteModal()
  } catch (error) {
    console.error('Failed to delete post:', error)
  }
}

async function openRepliesModal(post) {
  repliesPost.value = post
  showRepliesModal.value = true
  repliesLoading.value = true
  replies.value = []
  try {
    const response = await fetchReplies(post.id)
    const data = response.data
    // Laravel 可能直接返回数组，Node 返回 { replies: [] }
    replies.value = Array.isArray(data) ? data : (data?.replies || [])
  } catch (error) {
    console.error('Failed to fetch replies:', error)
  } finally {
    repliesLoading.value = false
  }
}

function closeRepliesModal() {
  showRepliesModal.value = false
  repliesPost.value = null
  replies.value = []
}

async function deleteReply(replyId) {
  try {
    await deleteReplyApi(replyId)
    replies.value = replies.value.filter((r) => r.id !== replyId)
    if (repliesPost.value) {
      await loadPosts()
      const latest = posts.value.find((p) => p.id === repliesPost.value.id)
      if (latest) repliesPost.value = latest
    }
  } catch (error) {
    console.error('Failed to delete reply:', error)
  }
}

function truncateTitle(title) {
  if (!title) return '-'
  return title.length > 40 ? title.substring(0, 40) + '...' : title
}
</script>

<style scoped>
.posts-page {
  animation: fadeIn 0.12s ease;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
  flex-wrap: wrap;
  gap: 1rem;
}

.header-content h2 {
  margin: 0 0 0.25rem 0;
  font-size: 1.5rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--text-primary);
}

.header-content p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.95rem;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.25rem;
  border-radius: 8px;
  font-weight: 500;
  text-decoration: none;
  transition: all 0.3s ease;
  border: none;
  cursor: pointer;
}

.btn-primary {
  background: var(--gradient-3);
  color: white;
}

.btn-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 5px 20px rgba(0, 212, 255, 0.3);
}

.btn-secondary {
  background: rgba(154, 157, 180, 0.15);
  color: var(--text-secondary);
}

.btn-secondary:hover {
  background: rgba(154, 157, 180, 0.25);
  color: var(--text-primary);
}

.btn-danger {
  background: #f5576c;
  color: white;
}

.btn-danger:hover {
  background: #e0455a;
  transform: translateY(-2px);
}

.btn-sm {
  padding: 0.5rem 1rem;
  font-size: 0.9rem;
}

.loading-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 300px;
}

.loading-spinner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  color: var(--text-secondary);
}

.loading-spinner i {
  font-size: 2rem;
  color: var(--primary-color);
}

.table-card {
  background: var(--bg-card);
  border-radius: 12px;
  border: 1px solid var(--border-color);
  overflow: visible;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
}

.table-header {
  padding: 1rem 1.5rem;
  border-bottom: 1px solid var(--border-color);
  background: rgba(0, 212, 255, 0.03);
}

.table-info {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--text-secondary);
  font-size: 0.9rem;
}

.table-info i {
  color: var(--primary-color);
}

.table-info strong {
  color: var(--primary-color);
}

.table-responsive {
  overflow-x: auto !important;
  overflow-y: hidden !important;
  -webkit-overflow-scrolling: touch;
  max-width: 100%;
  display: block;
  width: 100%;
}

.data-table {
  width: 100%;
  min-width: 1100px;
  border-collapse: collapse;
  display: table;
}

.table-responsive::-webkit-scrollbar {
  height: 8px;
}

.table-responsive::-webkit-scrollbar-track {
  background: var(--bg-darker);
  border-radius: 4px;
}

.table-responsive::-webkit-scrollbar-thumb {
  background: var(--primary-color);
  border-radius: 4px;
}

.table-responsive::-webkit-scrollbar-thumb:hover {
  background: #00b8e6;
}

.data-table {
  width: 100%;
  min-width: 1100px;
  border-collapse: collapse;
  display: table;
}

.scroll-indicator {
  display: none;
  padding: 0.5rem 1rem;
  background: var(--bg-darker);
  border-top: 1px solid var(--border-color);
  font-size: 0.75rem;
  color: var(--text-secondary);
  text-align: center;
  gap: 0.5rem;
  align-items: center;
  justify-content: center;
}

.scroll-indicator i {
  font-size: 0.8rem;
}

@media (max-width: 1200px) {
  .scroll-indicator {
    display: flex;
  }
}

@media (max-width: 768px) {
  .posts-page {
    width: 100%;
    max-width: 100%;
  }

  .table-card {
    border-radius: 8px;
  }

  .table-header {
    padding: 0.75rem 1rem;
  }

  .action-buttons {
    flex-direction: column;
    width: 100%;
  }

  .action-btn {
    width: 100%;
    justify-content: center;
  }

  .action-label {
    display: inline;
  }
}

@media (max-width: 576px) {
  .admin-content {
    padding: 0.5rem;
  }

  .data-table {
    min-width: 1000px;
  }
}

.data-table thead {
  background: var(--bg-darker);
}

.data-table th {
  padding: 1rem 1.5rem;
  text-align: left;
  font-weight: 600;
  color: var(--text-primary);
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.data-table th.text-center {
  text-align: center;
}

.data-table td {
  padding: 1rem 1.5rem;
  border-bottom: 1px solid var(--border-color);
  color: var(--text-secondary);
  vertical-align: middle;
}

.data-table tbody tr {
  transition: all 0.3s ease;
}

.data-table tbody tr:hover {
  background: rgba(0, 212, 255, 0.05);
}

.data-table tbody tr.pinned-row {
  background: rgba(0, 212, 255, 0.08);
}

.id-badge {
  display: inline-block;
  padding: 0.25rem 0.6rem;
  background: rgba(0, 212, 255, 0.1);
  color: var(--primary-color);
  border-radius: 4px;
  font-weight: 600;
  font-size: 0.85rem;
}

.title-cell {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  max-width: 400px;
}

.pinned-icon {
  color: var(--primary-color);
  font-size: 0.9rem;
}

.title-text {
  color: var(--text-primary);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.author-cell {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.author-cell i {
  color: var(--text-secondary);
  font-size: 0.85rem;
}

.replies-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.35rem 0.75rem;
  background: rgba(67, 233, 123, 0.1);
  border-radius: 6px;
  color: #43e97b;
  font-weight: 600;
  font-size: 0.85rem;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.35rem 0.75rem;
  border-radius: 6px;
  font-size: 0.8rem;
  font-weight: 500;
}

.status-badge.status-pinned {
  background: rgba(0, 212, 255, 0.15);
  color: var(--primary-color);
}

.status-badge.status-normal {
  background: rgba(154, 157, 180, 0.15);
  color: var(--text-secondary);
}

.date-cell {
  white-space: nowrap;
  font-size: 0.9rem;
}

.actions-cell {
  text-align: center;
}

.action-buttons {
  display: inline-flex;
  gap: 0.5rem;
  align-items: center;
  justify-content: center;
}

.action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 80px;
  height: 40px;
  padding: 0 1rem;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  transition: all 0.3s ease;
  text-decoration: none;
  gap: 0.5rem;
  font-size: 0.9rem;
  font-weight: 500;
}

.action-btn i {
  font-size: 1rem;
  flex-shrink: 0;
}

.action-label {
  display: none;
  white-space: nowrap;
  line-height: 1;
}

@media (min-width: 1200px) {
  .action-label {
    display: inline;
  }
}

.btn-info {
  background: rgba(23, 162, 184, 0.15);
  color: #17a2b8;
}

.btn-info:hover {
  background: #17a2b8;
  color: white;
}

.btn-warning {
  background: rgba(255, 193, 7, 0.15);
  color: #ffc107;
}

.btn-warning:hover {
  background: #ffc107;
  color: #000;
}

.btn-edit {
  background: rgba(0, 212, 255, 0.15);
  color: var(--primary-color);
}

.btn-edit:hover {
  background: var(--primary-color);
  color: white;
}

.btn-delete {
  background: rgba(245, 87, 108, 0.15);
  color: #f5576c;
}

.btn-delete:hover {
  background: #f5576c;
  color: white;
}

.btn-replies {
  background: rgba(0, 212, 255, 0.15);
  color: var(--primary-color);
}

.btn-replies:hover {
  background: var(--primary-color);
  color: white;
}

.empty-state {
  text-align: center;
  padding: 3rem !important;
  color: var(--text-secondary);
}

.empty-state i {
  font-size: 3rem;
  margin-bottom: 1rem;
  opacity: 0.5;
}

.empty-state p {
  margin: 0 0 1rem 0;
}

/* Modal Styles */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  animation: fadeIn 0.3s ease;
}

.modal-container {
  background: var(--bg-card);
  border-radius: 12px;
  border: 1px solid var(--border-color);
  max-width: 500px;
  width: 90%;
  animation: slideUp 0.3s ease;
}

.replies-modal {
  max-width: 760px;
}

.loading-inline {
  color: var(--text-secondary);
}

.empty-replies {
  color: var(--text-secondary);
}

.replies-list {
  max-height: 50vh;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.reply-item {
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 0.75rem;
  background: var(--bg-darker);
}

.reply-meta {
  display: flex;
  justify-content: space-between;
  color: var(--text-secondary);
  font-size: 0.85rem;
  margin-bottom: 0.5rem;
}

.reply-content {
  color: var(--text-primary);
  white-space: pre-wrap;
  margin-bottom: 0.75rem;
}

.modal-header {
  padding: 1.5rem;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.modal-header i {
  font-size: 1.5rem;
  color: #ffc107;
}

.modal-header h3 {
  margin: 0;
  font-size: 1.2rem;
  color: var(--text-primary);
}

.modal-body {
  padding: 1.5rem;
}

.modal-body p {
  margin: 0 0 1rem 0;
  color: var(--text-secondary);
  line-height: 1.6;
}

.post-title {
  background: rgba(0, 212, 255, 0.1);
  padding: 1rem;
  border-radius: 8px;
  border-left: 3px solid var(--primary-color);
}

.warning-text {
  color: #f5576c !important;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.modal-footer {
  padding: 1rem 1.5rem;
  border-top: 1px solid var(--border-color);
  display: flex;
  gap: 1rem;
  justify-content: flex-end;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 768px) {
  .page-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .btn {
    width: 100%;
    justify-content: center;
  }

  .action-buttons {
    flex-direction: column;
    width: 100%;
  }

  .action-btn {
    width: 100%;
    justify-content: center;
  }

  .action-label {
    display: inline;
  }
}
</style>
