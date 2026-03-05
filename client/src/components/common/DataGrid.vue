<template>
  <div class="data-grid-wrapper">
    <div class="data-grid-scroll">
      <table class="data-grid">
        <thead>
          <tr>
            <slot name="header" />
          </tr>
        </thead>
        <tbody>
          <slot name="body" />
          <tr v-if="empty" class="empty-row">
            <td :colspan="10">
              <div class="empty-state">
                <i class="fas fa-inbox"></i>
                <p>{{ emptyText }}</p>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-if="showScrollHint" class="scroll-hint">
      <i class="fas fa-arrows-alt-h"></i>
      <span>Scroll horizontally to see all columns</span>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

defineProps({
  empty: {
    type: Boolean,
    default: false
  },
  emptyText: {
    type: String,
    default: 'No data found'
  },
  showScrollHint: {
    type: Boolean,
    default: true
  }
})

const showHint = ref(false)

function checkScroll() {
  const scrollContainer = document.querySelector('.data-grid-scroll')
  if (scrollContainer) {
    showHint.value = scrollContainer.scrollWidth > scrollContainer.clientWidth
  }
}

onMounted(() => {
  checkScroll()
  window.addEventListener('resize', checkScroll)
})

onUnmounted(() => {
  window.removeEventListener('resize', checkScroll)
})
</script>

<style scoped>
.data-grid-wrapper {
  background: var(--bg-card);
  border-radius: 12px;
  border: 1px solid var(--border-color);
  overflow: hidden;
  width: 100%;
}

.data-grid-scroll {
  overflow-x: auto !important;
  overflow-y: visible !important;
  -webkit-overflow-scrolling: touch;
  width: 100%;
  display: block;
}

.data-grid-scroll::-webkit-scrollbar {
  height: 8px;
}

.data-grid-scroll::-webkit-scrollbar-track {
  background: var(--bg-darker);
}

.data-grid-scroll::-webkit-scrollbar-thumb {
  background: var(--primary-color);
  border-radius: 4px;
}

.data-grid-scroll::-webkit-scrollbar-thumb:hover {
  background: #00b8e6;
}

.data-grid {
  width: 100%;
  min-width: max-content;
  border-collapse: collapse;
  display: table;
}

.data-grid thead tr {
  background: var(--bg-darker);
}

.data-grid th {
  padding: 1rem 1.25rem;
  text-align: left;
  font-weight: 600;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-primary);
  border-bottom: 2px solid var(--border-color);
  white-space: nowrap;
}

.data-grid td {
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--border-color);
  color: var(--text-secondary);
  vertical-align: middle;
  white-space: nowrap;
}

.data-grid tbody tr:hover {
  background: rgba(0, 212, 255, 0.03);
}

.empty-row td {
  padding: 3rem !important;
}

.empty-state {
  text-align: center;
  color: var(--text-secondary);
}

.empty-state i {
  font-size: 3rem;
  margin-bottom: 1rem;
  opacity: 0.5;
  display: block;
}

.empty-state p {
  margin: 0;
}

.scroll-hint {
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

.scroll-hint i {
  font-size: 0.8rem;
}

@media (max-width: 1200px) {
  .scroll-hint {
    display: flex;
  }
}
</style>
