<template>
  <div
    v-if="configs.length"
    :id="pickerId"
    class="pdc-config-picker"
    :class="[
      variant === 'hero' ? 'pdc-config-picker-hero' : '',
      { 'pdc-config-picker-highlight': highlight },
    ]"
  >
    <div class="pdc-config-options">
      <button
        v-for="cfg in configs"
        :key="keyPrefix + cfg.id"
        type="button"
        class="pdc-config-option"
        :class="{ active: modelValue === cfg.id }"
        @click="emit('update:modelValue', cfg.id)"
      >
        <span class="pdc-config-name">{{ cfg.name }}</span>
        <span class="pdc-config-price">{{ formatPrice(cfg) }}</span>
      </button>
    </div>
  </div>
</template>

<script setup>
import { useI18n } from 'vue-i18n'
import { formatConfigPriceUsdt } from '@/utils/productConfig'

defineProps({
  configs: { type: Array, default: () => [] },
  modelValue: { type: String, default: null },
  highlight: { type: Boolean, default: false },
  variant: { type: String, default: 'default' },
  keyPrefix: { type: String, default: '' },
  pickerId: { type: String, default: '' },
})

const emit = defineEmits(['update:modelValue'])

const { t } = useI18n()

function formatPrice(cfg) {
  return formatConfigPriceUsdt(cfg, t('products.detail.priceTbd'))
}
</script>

<style scoped>
.pdc-config-picker-hero {
  margin: 1rem 0 0.25rem;
  max-width: 420px;
}

.pdc-config-picker-highlight {
  border-radius: 12px;
  box-shadow: 0 0 0 2px rgba(0, 229, 255, 0.65), 0 0 18px rgba(0, 229, 255, 0.25);
  animation: pdc-config-pulse 1.1s ease-in-out 2;
}

@keyframes pdc-config-pulse {
  0%,
  100% {
    box-shadow: 0 0 0 2px rgba(0, 229, 255, 0.65), 0 0 18px rgba(0, 229, 255, 0.25);
  }
  50% {
    box-shadow: 0 0 0 3px rgba(255, 0, 255, 0.55), 0 0 24px rgba(255, 0, 255, 0.2);
  }
}

.pdc-config-picker {
  margin: 0.75rem 0 0.5rem;
  text-align: left;
}

.pdc-config-options {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.pdc-config-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  width: 100%;
  padding: 0.65rem 0.85rem;
  border-radius: 10px;
  border: 1px solid rgba(0, 229, 255, 0.25);
  background: rgba(0, 0, 0, 0.25);
  color: #fff;
  cursor: pointer;
  transition: border-color 0.2s, box-shadow 0.2s, background 0.2s;
}

.pdc-config-option:hover {
  border-color: rgba(0, 229, 255, 0.55);
}

.pdc-config-option.active {
  border-color: var(--pdc-cyan, #00f3ff);
  background: rgba(0, 229, 255, 0.12);
  box-shadow: 0 0 12px rgba(0, 229, 255, 0.2);
}

.pdc-config-name {
  font-weight: 600;
  text-align: left;
}

.pdc-config-price {
  font-family: Orbitron, sans-serif;
  font-size: 0.9rem;
  color: var(--pdc-usdt, #26a17b);
  flex-shrink: 0;
}
</style>
