<template>
  <div>
    <AppHeader />
    <main>
      <div class="page-header">
        <div class="container">
          <h1><i class="fas fa-shopping-cart"></i> {{ $t('cart.title') }}</h1>
        </div>
      </div>

      <div class="cart-page">
        <div class="container">
          <div v-if="cartItems.length === 0" class="empty-state">
            <i class="fas fa-shopping-cart"></i>
            <p>{{ $t('cart.empty') }}</p>
            <router-link to="/products" class="btn btn-primary">
              <i class="fas fa-store"></i> {{ $t('cart.browse') }}
            </router-link>
          </div>

          <div v-else class="cart-content">
            <div class="cart-items">
              <h2>{{ $t('cart.items') }}</h2>
              <div v-for="item in cartItems" :key="item.productId" class="cart-item">
                <div class="cart-item-image">
                  <img :src="getProductImage(item)" :alt="item.name" @error="handleImageError" />
                </div>
                <div class="cart-item-info">
                  <h3>{{ item.name }}</h3>
                  <p class="cart-item-description">{{ item.description }}</p>
                  <div class="cart-item-price">
                    <span class="price-label">{{ $t('cart.price') }}: </span>
                    <span class="price-amount">{{ item.priceUsdt || item.price || 0 }} USDT</span>
                  </div>
                </div>
                <div class="cart-item-actions">
                  <div class="quantity-control">
                    <button type="button" class="btn-quantity" @click="decreaseQuantity(item.productId)" :disabled="item.quantity <= 1">
                      <i class="fas fa-minus"></i>
                    </button>
                    <input type="number" v-model.number="item.quantity" @change="updateQuantity(item.productId, item.quantity)" min="1" />
                    <button type="button" class="btn-quantity" @click="increaseQuantity(item.productId)">
                      <i class="fas fa-plus"></i>
                    </button>
                  </div>
                  <div class="cart-item-total">
                    <span class="total-label">{{ $t('cart.subtotal') }}: </span>
                    <span class="total-amount">{{ getItemTotal(item) }} USDT</span>
                  </div>
                  <button type="button" class="btn-remove" @click="removeItem(item.productId)">
                    <i class="fas fa-trash"></i>
                  </button>
                </div>
              </div>
            </div>

            <div class="cart-summary">
              <h2>{{ $t('cart.summary') }}</h2>
              <div class="summary-row">
                <span>{{ $t('cart.items') }}:</span>
                <span>{{ itemCount }}</span>
              </div>
              <div class="summary-row total">
                <span>{{ $t('cart.total') }}:</span>
                <span>{{ totalPrice }} USDT</span>
              </div>
              <div class="cart-actions">
                <button type="button" class="btn btn-secondary" @click="continueShopping">
                  <i class="fas fa-arrow-left"></i> {{ $t('cart.continue') }}
                </button>
                <button type="button" class="btn btn-primary" @click="checkout" :disabled="submitting">
                  <i class="fas fa-credit-card"></i> {{ submitting ? $t('common.loading') : $t('cart.checkout') }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
    <AppFooter />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useCartStore } from '@/stores/cart'
import { useAuthStore } from '@/stores/auth'
import api from '@/services/api'
import AppHeader from '@/components/common/AppHeader.vue'
import AppFooter from '@/components/common/AppFooter.vue'
import { primaryProductImage } from '@/utils/productImages'

const router = useRouter()
const cartStore = useCartStore()
const authStore = useAuthStore()

const submitting = ref(false)

const cartItems = computed(() => cartStore.items)
const itemCount = computed(() => cartStore.itemCount)
const totalPrice = computed(() => cartStore.totalPrice)

onMounted(async () => {
  await authStore.checkAuth()
  // 如果用户已登录，加载购物车数据
  if (authStore.isLoggedIn) {
    await cartStore.loadCart()
  }
})

function handleImageError(e) {
  e.target.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">' +
    '<rect fill="#1a1f3a" width="100%" height="100%"/>' +
    '<text x="50%" y="50%" fill="#00d4ff" font-family="Arial" font-size="12" text-anchor="middle" dy=".3em">No Image</text>' +
    '</svg>'
  )
}

function increaseQuantity(productId) {
  const item = cartStore.getCartItem(productId)
  if (item) {
    cartStore.updateQuantity(productId, item.quantity + 1)
  }
}

function decreaseQuantity(productId) {
  const item = cartStore.getCartItem(productId)
  if (item && item.quantity > 1) {
    cartStore.updateQuantity(productId, item.quantity - 1)
  }
}

function updateQuantity(productId, quantity) {
  cartStore.updateQuantity(productId, parseInt(quantity) || 1)
}

function removeItem(productId) {
  cartStore.removeItem(productId)
}

function getItemTotal(item) {
  return ((item.priceUsdt || item.price || 0) * item.quantity).toFixed(2)
}

function getProductImage(item) {
  return primaryProductImage(item)
}

function continueShopping() {
  router.push('/products')
}

async function checkout() {
  if (!authStore.isLoggedIn) {
    router.push({ name: 'login', query: { redirect: '/cart' } })
    return
  }

  submitting.value = true
  const createdOrderIds = []

  try {
    // 为购物车中的每个商品创建订单
    // 使用串行处理以确保事务性：如果任何订单创建失败，回滚已创建的订单
    for (const item of cartItems.value) {
      try {
        const response = await api.post('/api/orders', {
          productId: item.productId,
          quantity: item.quantity
        })
        if (response.data && response.data.orderId) {
          createdOrderIds.push(response.data.orderId)
        }
      } catch (orderError) {
        // 订单创建失败，回滚已创建的订单
        console.error('Failed to create order for product:', item.productId, orderError)
        await rollbackCreatedOrders(createdOrderIds)
        throw new Error(`Failed to create order for product ${item.productId}: ${orderError.response?.data?.error || 'Unknown error'}`)
      }
    }

    // 所有订单创建成功，清空购物车
    await cartStore.clearCart()

    // 跳转到订单页面
    router.push('/orders')
  } catch (error) {
    console.error('Failed to checkout:', error)
    alert(error.message || 'Checkout failed, please try again')
  } finally {
    submitting.value = false
  }
}

// 回滚已创建的订单（将订单状态改为 cancelled）
async function rollbackCreatedOrders(orderIds) {
  if (orderIds.length === 0) return

  console.log('Rolling back created orders:', orderIds)
  try {
    // 使用 updateStatus API 将订单状态改为 cancelled
    const cancelPromises = orderIds.map(async (orderId) => {
      try {
        await api.put(`/api/orders/${orderId}/status`, {
          status: 'cancelled',
          cancelReason: 'Checkout failed - automatic rollback'
        })
        console.log(`Order ${orderId} cancelled successfully`)
      } catch (error) {
        console.error(`Failed to cancel order ${orderId}:`, error)
        // 记录失败的取消操作，但不抛出错误，因为这是回滚操作
      }
    })
    await Promise.all(cancelPromises)
    console.log('Rollback completed')
  } catch (rollbackError) {
    console.error('Failed to rollback orders:', rollbackError)
  }
}
</script>

<style scoped>
.cart-page {
  padding: 40px 0;
  min-height: 60vh;
}

.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: #8892b0;
}

.empty-state i {
  font-size: 64px;
  margin-bottom: 20px;
  display: block;
}

.empty-state p {
  font-size: 18px;
  margin-bottom: 30px;
}

.cart-content {
  display: grid;
  grid-template-columns: 1fr 400px;
  gap: 40px;
}

.cart-items h2,
.cart-summary h2 {
  font-size: 20px;
  margin-bottom: 20px;
  color: #e6f1ff;
}

.cart-item {
  display: grid;
  grid-template-columns: 120px 1fr auto;
  gap: 20px;
  padding: 20px;
  background: rgba(26, 31, 58, 0.5);
  border-radius: 8px;
  margin-bottom: 20px;
}

.cart-item-image img {
  width: 120px;
  height: 120px;
  object-fit: cover;
  border-radius: 8px;
}

.cart-item-info h3 {
  font-size: 16px;
  margin-bottom: 8px;
  color: #e6f1ff;
}

.cart-item-description {
  font-size: 14px;
  color: #8892b0;
  margin-bottom: 10px;
}

.cart-item-price {
  font-size: 16px;
  color: #00d4ff;
}

.cart-item-actions {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 15px;
}

.quantity-control {
  display: flex;
  align-items: center;
  gap: 10px;
}

.btn-quantity {
  width: 32px;
  height: 32px;
  border: 1px solid #00d4ff;
  background: transparent;
  color: #00d4ff;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s;
}

.btn-quantity:hover:not(:disabled) {
  background: rgba(0, 212, 255, 0.1);
}

.btn-quantity:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.quantity-control input {
  width: 60px;
  text-align: center;
  background: rgba(26, 31, 58, 0.8);
  border: 1px solid #233554;
  color: #e6f1ff;
  padding: 5px;
  border-radius: 4px;
}

.cart-item-total {
  font-size: 16px;
  color: #e6f1ff;
}

.total-amount {
  color: #00d4ff;
  font-weight: bold;
}

.btn-remove {
  background: transparent;
  border: none;
  color: #ff6b6b;
  cursor: pointer;
  padding: 8px;
  transition: all 0.3s;
}

.btn-remove:hover {
  color: #ff5252;
}

.cart-summary {
  background: rgba(26, 31, 58, 0.8);
  padding: 25px;
  border-radius: 8px;
  height: fit-content;
  position: sticky;
  top: 20px;
}

.summary-row {
  display: flex;
  justify-content: space-between;
  padding: 12px 0;
  border-bottom: 1px solid #233554;
  color: #8892b0;
}

.summary-row.total {
  border-bottom: none;
  font-size: 18px;
  color: #e6f1ff;
  font-weight: bold;
}

.summary-row.total span:last-child {
  color: #00d4ff;
}

.cart-actions {
  display: flex;
  flex-direction: column;
  gap: 15px;
  margin-top: 25px;
}

@media (max-width: 768px) {
  .cart-content {
    grid-template-columns: 1fr;
  }

  .cart-item {
    grid-template-columns: 80px 1fr;
  }

  .cart-item-actions {
    grid-column: 1 / -1;
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
  }
}
</style>
