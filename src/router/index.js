import { createRouter, createWebHashHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useAdminStore } from '@/stores/admin'
import { isSafeInternalRedirect } from '@/utils/productCheckout'

const routes = [
  // User routes
  {
    path: '/',
    name: 'home',
    component: () => import('@/views/user/HomeView.vue'),
    meta: { title: 'Home' }
  },
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/user/LoginView.vue'),
    meta: { title: 'Login', guest: true }
  },
  {
    path: '/register',
    name: 'register',
    component: () => import('@/views/user/RegisterView.vue'),
    meta: { title: 'Register', guest: true }
  },
  {
    path: '/products',
    name: 'products',
    component: () => import('@/views/user/ProductsView.vue'),
    meta: { title: 'Products' }
  },
  {
    path: '/products/:id',
    name: 'product-detail',
    component: () => import('@/views/user/ProductDetailView.vue'),
    meta: { title: 'Product Detail' }
  },
  {
    path: '/products/:id/buy',
    redirect: (to) => ({
      name: 'product-detail',
      params: { id: to.params.id },
      query: { checkout: '1' }
    })
  },
  {
    path: '/cart',
    name: 'cart',
    component: () => import('@/views/user/CartView.vue'),
    meta: { title: 'Shopping Cart' }
  },
  {
    path: '/orders',
    name: 'orders',
    component: () => import('@/views/user/OrdersView.vue'),
    meta: { title: 'My Orders', requiresAuth: true }
  },
  {
    path: '/orders/:id',
    name: 'order-detail',
    component: () => import('@/views/user/OrderDetailView.vue'),
    meta: { title: 'Order Detail', requiresAuth: true }
  },
  {
    path: '/orders/:id/pay',
    name: 'payment',
    component: () => import('@/views/user/PaymentView.vue'),
    meta: { title: 'Payment', requiresAuth: true }
  },
  {
    path: '/forum',
    name: 'forum',
    component: () => import('@/views/user/ForumView.vue'),
    meta: { title: 'Forum' }
  },
  {
    path: '/forum/post',
    name: 'forum-post',
    component: () => import('@/views/user/ForumPostView.vue'),
    meta: { title: 'New Post', requiresAuth: true }
  },
  {
    path: '/forum/:id',
    name: 'forum-detail',
    component: () => import('@/views/user/ForumDetailView.vue'),
    meta: { title: 'Forum Post' }
  },
  {
    path: '/chat',
    name: 'chat',
    component: () => import('@/views/user/ChatView.vue'),
    meta: { title: 'Chat' }
  },
  {
    path: '/admin/chat',
    name: 'admin-chat',
    component: () => import('@/views/user/ChatAdminView.vue'),
    meta: { title: 'Admin Chat', requiresAdmin: true, layout: 'admin' }
  },

  // Admin routes
  {
    path: '/admin/login',
    name: 'admin-login',
    component: () => import('@/views/admin/LoginView.vue'),
    meta: { title: 'Admin Login', guest: true, layout: 'blank' }
  },
  {
    path: '/admin',
    name: 'admin-dashboard',
    component: () => import('@/views/admin/DashboardView.vue'),
    meta: { title: 'Dashboard', requiresAdmin: true, layout: 'admin' }
  },
  {
    path: '/admin/users',
    name: 'admin-users',
    component: () => import('@/views/admin/UsersView.vue'),
    meta: { title: 'User Management', requiresAdmin: true, layout: 'admin' }
  },
  {
    path: '/admin/users/edit/:id?',
    name: 'admin-user-form',
    component: () => import('@/views/admin/UserFormView.vue'),
    meta: { title: 'User Form', requiresAdmin: true, layout: 'admin' }
  },
  {
    path: '/admin/products',
    name: 'admin-products',
    component: () => import('@/views/admin/ProductsView.vue'),
    meta: { title: 'Product Management', requiresAdmin: true, layout: 'admin' }
  },
  {
    path: '/admin/products/add',
    name: 'admin-product-add',
    component: () => import('@/views/admin/ProductFormView.vue'),
    meta: { title: 'Add Product', requiresAdmin: true, layout: 'admin' }
  },
  {
    path: '/admin/products/edit/:id',
    name: 'admin-product-edit',
    component: () => import('@/views/admin/ProductFormView.vue'),
    meta: { title: 'Edit Product', requiresAdmin: true, layout: 'admin' }
  },
  {
    path: '/admin/posts',
    name: 'admin-posts',
    component: () => import('@/views/admin/PostsView.vue'),
    meta: { title: 'Forum Management', requiresAdmin: true, layout: 'admin' }
  },
  {
    path: '/admin/posts/add',
    name: 'admin-post-add',
    component: () => import('@/views/admin/PostFormView.vue'),
    meta: { title: 'Add Post', requiresAdmin: true, layout: 'admin' }
  },
  {
    path: '/admin/posts/edit/:id',
    name: 'admin-post-edit',
    component: () => import('@/views/admin/PostFormView.vue'),
    meta: { title: 'Edit Post', requiresAdmin: true, layout: 'admin' }
  },
  {
    path: '/admin/orders',
    name: 'admin-orders',
    component: () => import('@/views/admin/OrdersView.vue'),
    meta: { title: 'Order Management', requiresAdmin: true, layout: 'admin' }
  },
  {
    path: '/admin/payment-settings',
    name: 'admin-payment-settings',
    component: () => import('@/views/admin/PaymentSettingsView.vue'),
    meta: { title: 'Payment Settings', requiresAdmin: true, layout: 'admin' }
  },
  {
    path: '/admin/popup-notices',
    name: 'admin-popup-notices',
    component: () => import('@/views/admin/PopupNoticesView.vue'),
    meta: { title: 'Popup Notices', requiresAdmin: true, layout: 'admin' }
  },
  {
    path: '/admin/chat-settings',
    name: 'admin-chat-settings',
    component: () => import('@/views/admin/ChatSettingsView.vue'),
    meta: { title: 'Chat Settings', requiresAdmin: true, layout: 'admin' }
  },
  {
    path: '/admin/device-verification',
    name: 'admin-device-verification',
    component: () => import('@/views/admin/DeviceVerificationView.vue'),
    meta: { title: 'Device Verification', requiresAdmin: true, layout: 'admin' }
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

// Navigation guards
router.beforeEach(async (to, from, next) => {
  document.title = `${to.meta.title || 'Page'} - YHthestudio`

  const authStore = useAuthStore()
  const adminStore = useAdminStore()

  // Check auth status on first navigation
  if (!authStore.checked) {
    await authStore.checkAuth()
  }
  if (!adminStore.checked) {
    await adminStore.checkAuth()
  }

  // Routes requiring user authentication
  if (to.meta.requiresAuth && !authStore.isLoggedIn) {
    return next({ name: 'login', query: { redirect: to.fullPath } })
  }

  // Routes requiring admin authentication
  if (to.meta.requiresAdmin && !adminStore.isLoggedIn) {
    return next({ name: 'admin-login' })
  }

  // Logged in users accessing guest pages
  if (to.meta.guest) {
    if (authStore.isLoggedIn && to.name === 'login') {
      const redir = to.query.redirect
      if (typeof redir === 'string' && isSafeInternalRedirect(redir)) {
        return next(redir)
      }
      return next({ name: 'home' })
    }
    if (adminStore.isLoggedIn && to.name === 'admin-login') {
      return next({ name: 'admin-dashboard' })
    }
  }

  next()
})

export default router