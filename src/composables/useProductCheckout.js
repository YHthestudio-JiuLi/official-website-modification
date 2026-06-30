import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { startProductCheckout } from '@/utils/productCheckout'
import { findProductConfig, normalizeProductConfigs } from '@/utils/productConfig'

/**
 * 商品详情页：配置选择 + 立即购买 + ?checkout=1 登录回跳
 */
export function useProductCheckout({ route, router, product, loading }) {
  const { t } = useI18n()

  const selectedConfigId = ref(null)
  const configExplicitlySelected = ref(false)
  const configPickerHighlight = ref(false)
  const buySubmitting = ref(false)
  const checkoutNavLock = ref(false)

  const productConfigs = computed(() => normalizeProductConfigs(product.value?.configs))

  const selectedConfig = computed(() =>
    findProductConfig(productConfigs.value, selectedConfigId.value)
  )

  const canCheckout = computed(() => {
    if (!productConfigs.value.length) return true
    return configExplicitlySelected.value && !!selectedConfigId.value
  })

  const buyNowLabel = computed(() => {
    if (buySubmitting.value) return t('products.detail.buyProcessing')
    if (productConfigs.value.length && !configExplicitlySelected.value) {
      return t('products.detail.selectConfigToBuy')
    }
    return t('products.detail.buyNow')
  })

  function resetCheckoutLocks() {
    checkoutNavLock.value = false
  }

  function resetConfigState() {
    selectedConfigId.value = null
    configExplicitlySelected.value = false
    configPickerHighlight.value = false
  }

  function onConfigSelected(id) {
    selectedConfigId.value = id
    configExplicitlySelected.value = true
    configPickerHighlight.value = false
  }

  function promptConfigSelection() {
    configPickerHighlight.value = true
    window.setTimeout(() => {
      configPickerHighlight.value = false
    }, 2200)
  }

  function restoreConfigFromQuery(queryConfigId) {
    const cfg = findProductConfig(productConfigs.value, queryConfigId)
    if (cfg) {
      selectedConfigId.value = cfg.id
      configExplicitlySelected.value = true
    }
  }

  function checkoutConfigId() {
    const fromQuery = String(route.query.configId || '').trim()
    if (fromQuery) return fromQuery
    return productConfigs.value.length ? selectedConfigId.value : null
  }

  async function navigateToCheckout({ alertIfConfigMissing = false } = {}) {
    if (!product.value?.id) return false

    const configId = checkoutConfigId()
    if (productConfigs.value.length && (!configId || !configExplicitlySelected.value)) {
      promptConfigSelection()
      if (alertIfConfigMissing) {
        alert(t('products.detail.selectConfigRequired'))
      }
      return false
    }

    await startProductCheckout(router, product.value.id, { configId })
    return true
  }

  async function onBuyNowClick() {
    if (!product.value?.id || buySubmitting.value) return
    if (!canCheckout.value) {
      promptConfigSelection()
      return
    }
    buySubmitting.value = true
    try {
      await navigateToCheckout()
    } catch (e) {
      console.error(e)
      alert(t('products.detail.checkoutErrorAuth'))
    } finally {
      buySubmitting.value = false
    }
  }

  async function runCheckoutRedirect() {
    if (checkoutNavLock.value || !product.value?.id) return
    checkoutNavLock.value = true
    try {
      await navigateToCheckout({ alertIfConfigMissing: true })
    } catch (e) {
      console.error(e)
      checkoutNavLock.value = false
      await router.replace({
        name: 'product-detail',
        params: { id: String(route.params.id) },
        query: {},
      })
      alert(t('products.detail.checkoutErrorRetry'))
    }
  }

  watch(
    () => [route.query.checkout, loading.value, product.value?.id, route.params.id],
    async () => {
      if (String(route.query.checkout || '') !== '1') {
        checkoutNavLock.value = false
        return
      }
      if (loading.value) return
      if (!product.value?.id || String(product.value.id) !== String(route.params.id)) return
      await runCheckoutRedirect()
    },
    { flush: 'post' }
  )

  return {
    selectedConfigId,
    configExplicitlySelected,
    configPickerHighlight,
    buySubmitting,
    productConfigs,
    selectedConfig,
    canCheckout,
    buyNowLabel,
    resetCheckoutLocks,
    resetConfigState,
    onConfigSelected,
    promptConfigSelection,
    restoreConfigFromQuery,
    onBuyNowClick,
  }
}
