<template>
  <div class="pdc-spec-notice-panel">
    <div class="pdc-spec-notice-head">
      <span class="pdc-spec-notice-ico-wrap" aria-hidden="true">
        <i class="fas fa-exclamation pdc-spec-notice-head-ico" />
      </span>
      <h3 class="pdc-spec-notice-title">{{ $t('products.detail.noticeTitle') }}</h3>
    </div>
    <ul class="pdc-spec-notice-list">
      <li v-for="(row, idx) in lines" :key="keyPrefix + idx">
        <i
          :class="
            row.mode === 'ban'
              ? 'fas fa-ban pdc-spec-notice-ban'
              : 'fas fa-check pdc-spec-notice-check'
          "
        />
        <span :class="{ 'pdc-spec-notice-warn': row.mode === 'ban' }">{{ row.text }}</span>
      </li>
    </ul>
  </div>
</template>

<script setup>
defineProps({
  lines: { type: Array, default: () => [] },
  keyPrefix: { type: String, default: 'notice-' },
})
</script>
