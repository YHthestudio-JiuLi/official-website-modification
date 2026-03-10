import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '@/services/api'

export const useCartStore = defineStore('cart', () => {
  const items = ref([])
  const loaded = ref(false)

  const itemCount = computed(() => items.value.reduce((sum, item) => sum + item.quantity, 0))
  const totalPrice = computed(() => {
    return items.value.reduce((sum, item) => sum + (item.priceUsdt || item.price || 0) * item.quantity, 0).toFixed(2)
  })

  // 从后端加载购物车
  async function loadCart() {
    try {
      const response = await api.get('/api/cart')
      items.value = response.data
      loaded.value = true
    } catch (error) {
      // 401 表示用户未登录或 session 过期，这是正常情况
      if (error.response?.status === 401) {
        console.log('User not authenticated, cart not loaded')
      } else {
        console.error('Failed to load cart:', error)
      }
      items.value = []
      loaded.value = true
    }
  }

  // 添加商品到购物车
  async function addItem(product, quantity = 1) {
    try {
      // 检查商品是否已在购物车中
      const existingItem = getCartItem(product.id)
      const wasInCart = !!existingItem

      await api.post('/api/cart/items', {
        productId: product.id,
        quantity: quantity
      })
      // 重新加载购物车
      await loadCart()

      // 返回详细信息
      return {
        success: true,
        wasInCart: wasInCart,
        previousQuantity: wasInCart ? existingItem.quantity : 0,
        newQuantity: getCartItem(product.id)?.quantity || quantity
      }
    } catch (error) {
      console.error('Failed to add item to cart:', error)
      return {
        success: false,
        error: error.response?.data?.error || 'Unknown error'
      }
    }
  }

  // 更新商品数量
  async function updateQuantity(productId, quantity) {
    try {
      if (quantity <= 0) {
        await api.delete(`/api/cart/items/${productId}`)
      } else {
        await api.put(`/api/cart/items/${productId}`, { quantity })
      }
      // 重新加载购物车
      await loadCart()
    } catch (error) {
      console.error('Failed to update quantity:', error)
    }
  }

  // 从购物车移除商品
  async function removeItem(productId) {
    try {
      await api.delete(`/api/cart/items/${productId}`)
      // 重新加载购物车
      await loadCart()
    } catch (error) {
      console.error('Failed to remove item:', error)
    }
  }

  // 清空购物车 - 添加认证检查和错误处理
  async function clearCart() {
    try {
      // 先检查是否有购物车数据
      if (items.value.length === 0) {
        return { success: true }
      }

      await api.delete('/api/cart')
      items.value = []
      return { success: true }
    } catch (error) {
      // 401 表示用户未登录，直接清空本地数据
      if (error.response?.status === 401) {
        console.log('User not authenticated, clearing local cart data')
        items.value = []
        return { success: true }
      }
      console.error('Failed to clear cart:', error)
      return {
        success: false,
        error: error.response?.data?.error || 'Unknown error'
      }
    }
  }

  function isInCart(productId) {
    return items.value.some(item => item.productId === productId)
  }

  function getCartItem(productId) {
    return items.value.find(item => item.productId === productId)
  }

  return {
    items,
    loaded,
    itemCount,
    totalPrice,
    loadCart,
    addItem,
    updateQuantity,
    removeItem,
    clearCart,
    isInCart,
    getCartItem
  }
})
