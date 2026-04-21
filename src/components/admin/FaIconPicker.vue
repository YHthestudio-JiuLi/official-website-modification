<template>
  <div ref="rootRef" class="fa-icon-picker">
    <button
      type="button"
      class="fa-icon-picker__trigger"
      :class="{ 'is-open': open }"
      :aria-expanded="open"
      aria-haspopup="listbox"
      @click.stop="toggle"
    >
      <i :class="pickerIconClass(modelValue)" aria-hidden="true" />
      <i class="fas fa-chevron-down fa-icon-picker__caret" aria-hidden="true" />
    </button>
    <Transition name="fa-ip-fade">
      <div
        v-show="open"
        class="fa-icon-picker__panel"
        role="listbox"
        @click.stop
      >
        <button
          v-for="opt in normalizedOptions"
          :key="opt.value"
          type="button"
          class="fa-icon-picker__opt"
          :class="{ 'is-active': opt.value === modelValue }"
          :title="opt.title"
          role="option"
          :aria-selected="opt.value === modelValue"
          @click="selectIcon(opt.value)"
        >
          <i :class="pickerIconClass(opt.value)" aria-hidden="true" />
        </button>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'

const props = defineProps({
  /** 当前选中的类名，如 fa-camera */
  modelValue: { type: String, default: 'fa-star' },
  /** { value: 'fa-camera', label?: '相机' } */
  options: { type: Array, default: () => [] }
})

const emit = defineEmits(['update:modelValue'])

const open = ref(false)
const rootRef = ref(null)

const normalizedOptions = computed(() =>
  (props.options || []).map((o) => {
    if (typeof o === 'string') return { value: o, title: o }
    const value = o.value || 'fa-star'
    const name = o.label || o.title || value
    // 悬停显示中文名 + 类名，便于核对
    return { value, title: `${name}（${value}）` }
  })
)

/** 生成 fas + fa-xxx 的 class 列表 */
function pickerIconClass(icon) {
  const v = String(icon || 'fa-star').trim()
  if (!v) return ['fas', 'fa-star']
  if (/\s/.test(v)) return v.split(/\s+/).filter(Boolean)
  return ['fas', v.startsWith('fa-') ? v : `fa-${v}`]
}

function selectIcon(v) {
  emit('update:modelValue', v)
  open.value = false
}

function toggle() {
  open.value = !open.value
}

function onDocumentPointerDown(e) {
  if (!open.value || !rootRef.value) return
  if (!rootRef.value.contains(e.target)) open.value = false
}

function onKeydown(e) {
  if (e.key === 'Escape') open.value = false
}

watch(open, (v) => {
  if (v) document.addEventListener('keydown', onKeydown)
  else document.removeEventListener('keydown', onKeydown)
})

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerDown, true)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown, true)
  document.removeEventListener('keydown', onKeydown)
})
</script>

<style scoped>
.fa-icon-picker {
  position: relative;
  width: 100%;
}

.fa-icon-picker__trigger {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.875rem 1rem;
  background: var(--bg-dark);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  color: var(--text-primary);
  cursor: pointer;
  transition: border-color 0.2s, box-shadow 0.2s;
  min-height: 48px;
  box-sizing: border-box;
}

.fa-icon-picker__trigger:hover {
  border-color: var(--primary-color);
}

.fa-icon-picker__trigger.is-open {
  border-color: var(--primary-color);
  box-shadow: 0 0 0 3px rgba(0, 212, 255, 0.12);
}

.fa-icon-picker__trigger > i:first-child {
  font-size: 1.25rem;
  color: var(--primary-color);
}

.fa-icon-picker__caret {
  font-size: 0.7rem;
  opacity: 0.65;
  color: var(--text-secondary);
}

.fa-icon-picker__panel {
  position: absolute;
  z-index: 80;
  left: 0;
  right: 0;
  top: calc(100% + 6px);
  padding: 0.65rem;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.4rem;
  max-height: 220px;
  overflow-y: auto;
}

.fa-icon-picker__opt {
  display: flex;
  align-items: center;
  justify-content: center;
  aspect-ratio: 1;
  max-height: 48px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.2);
  color: var(--primary-color);
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, transform 0.1s;
}

.fa-icon-picker__opt:hover {
  background: rgba(0, 212, 255, 0.12);
  border-color: rgba(0, 212, 255, 0.35);
}

.fa-icon-picker__opt.is-active {
  border-color: var(--primary-color);
  background: rgba(0, 212, 255, 0.18);
}

.fa-icon-picker__opt i {
  font-size: 1.15rem;
}

.fa-icon-picker__opt:active {
  transform: scale(0.96);
}

.fa-ip-fade-enter-active,
.fa-ip-fade-leave-active {
  transition: opacity 0.12s ease, transform 0.12s ease;
}
.fa-ip-fade-enter-from,
.fa-ip-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
