import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { parseProductImages } from '@/utils/productImages'
import { formatConfigPriceUsdt } from '@/utils/productConfig'

/** 商品详情页展示层：图库、跑马灯、定价、功能/规格卡 */
export function useProductDetailPresentation({
  product,
  popupNotice,
  productConfigs,
  selectedConfig,
  configExplicitlySelected,
}) {
  const { t } = useI18n()
  const selectedGalleryIndex = ref(0)

  const galleryImages = computed(() =>
    parseProductImages(product.value?.image, product.value?.images)
  )

  const heroDisplayImage = computed(() => {
    const arr = galleryImages.value
    if (!arr.length) return ''
    return arr[selectedGalleryIndex.value] ?? arr[0]
  })

  function selectGalleryImage(index) {
    if (index >= 0 && index < galleryImages.value.length) {
      selectedGalleryIndex.value = index
    }
  }

  function resetGallery() {
    selectedGalleryIndex.value = 0
  }

  function stripHtmlForMarquee(html) {
    if (!html || typeof html !== 'string') return ''
    return html
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, ' ')
      .trim()
  }

  const marqueePlainText = computed(() => {
    const n = popupNotice.value
    if (!n) return ''
    const title = String(n.title || '').trim()
    const body = stripHtmlForMarquee(String(n.content || ''))
    if (title && body) return t('products.detail.noticeMarqueeBoth', { title, body })
    return title || body
  })

  const marqueeTrackStyle = computed(() => {
    const len = marqueePlainText.value.length
    const sec = Math.min(100, Math.max(22, len * 0.32))
    return { animationDuration: `${sec}s` }
  })

  const heroParts = computed(() => {
    const name = product.value?.name || ''
    const m = name.match(/^(.+?)(\d+)(.*)$/)
    if (m) return { prefix: m[1], num: m[2], suffix: m[3] }
    return null
  })

  const primaryPriceKind = computed(() => {
    const p = product.value
    if (!p) return 'none'
    if (selectedConfig.value) {
      const n = Number(selectedConfig.value.priceUsdt)
      if (Number.isFinite(n) && n > 0) return 'usdt'
      return 'none'
    }
    const usdtRaw = p.priceUsdt
    const usdtNum = usdtRaw != null && usdtRaw !== '' ? Number(usdtRaw) : NaN
    if (Number.isFinite(usdtNum) && usdtNum > 0) return 'usdt'
    const cny = p.price
    if (cny != null && cny !== '' && Number(cny) > 0) return 'cny'
    return 'none'
  })

  const primaryPriceText = computed(() => {
    const p = product.value
    if (!p) return t('products.detail.dash')
    if (productConfigs.value.length && !configExplicitlySelected.value) {
      return t('products.detail.selectConfigForPrice')
    }
    if (selectedConfig.value) {
      return formatConfigPriceUsdt(selectedConfig.value, t('products.detail.priceTbd'))
    }
    const k = primaryPriceKind.value
    if (k === 'usdt') return `${Number(p.priceUsdt)} USDT`
    if (k === 'cny') return `¥${p.price}`
    return t('products.detail.priceTbd')
  })

  const displayFeatureCards = computed(() => {
    const raw = product.value?.featureCards
    if (!Array.isArray(raw) || !raw.length) return []
    return raw
      .map((c) => ({
        title: String(c.title || '').trim(),
        description: String(c.description || '').trim(),
        icon: typeof c.icon === 'string' ? c.icon.trim() : '',
      }))
      .filter((c) => c.title || c.description)
      .slice(0, 12)
  })

  function featureIconClass(item) {
    const ic = (item.icon || 'fa-star').trim()
    if (!ic) return ['fas', 'fa-star']
    if (/\s/.test(ic)) return ic.split(/\s+/).filter(Boolean)
    return ['fas', ic.startsWith('fa-') ? ic : `fa-${ic}`]
  }

  function specIconClass(item) {
    const ic = (item.icon || '').trim()
    if (!ic) return ['fas', 'fa-microchip']
    return featureIconClass({ ...item, icon: ic })
  }

  const displaySpecCards = computed(() => {
    const raw = product.value?.specCards
    if (!Array.isArray(raw) || !raw.length) return []
    return raw
      .map((c) => ({
        title: String(c.title || '').trim(),
        description: String(c.description || '').trim(),
        icon: typeof c.icon === 'string' ? c.icon.trim() : '',
      }))
      .filter((c) => c.title || c.description)
      .slice(0, 12)
  })

  const displayUsageNoticeLines = computed(() => {
    const raw = product.value?.usageNoticeLines
    if (!Array.isArray(raw) || !raw.length) return []
    return raw
      .map((r) => ({
        text: String(r.text || '').trim(),
        mode: r.mode === 'ban' ? 'ban' : 'check',
      }))
      .filter((r) => r.text)
      .slice(0, 20)
  })

  const showSpecsSection = computed(
    () => displaySpecCards.value.length > 0 || displayUsageNoticeLines.value.length > 0
  )

  return {
    selectedGalleryIndex,
    galleryImages,
    heroDisplayImage,
    selectGalleryImage,
    resetGallery,
    marqueePlainText,
    marqueeTrackStyle,
    heroParts,
    primaryPriceKind,
    primaryPriceText,
    displayFeatureCards,
    displaySpecCards,
    displayUsageNoticeLines,
    showSpecsSection,
    featureIconClass,
    specIconClass,
  }
}
