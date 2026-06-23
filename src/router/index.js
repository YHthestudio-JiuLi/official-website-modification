import { createRouter, createWebHashHistory } from 'vue-router'
import { setDocumentTitle } from '@/utils/documentTitle'
import { isSafeInternalRedirect } from '@/utils/authRedirect'
import { useAuthStore } from '@/stores/auth'
import { useAdminStore } from '@/stores/admin'
import { useAdminV2Store } from '@/stores/adminV2'
import i18n from '@/i18n'

const routes = [
  // User routes
  {
    path: '/',
    name: 'home',
    component: () => import('@/views/user/HomeView.vue'),
    meta: { titleKey: 'titles.home' }
  },
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/user/LoginView.vue'),
    meta: { titleKey: 'titles.login', guest: true }
  },
  {
    path: '/register',
    name: 'register',
    component: () => import('@/views/user/RegisterView.vue'),
    meta: { titleKey: 'titles.register', guest: true }
  },
  {
    path: '/products',
    name: 'products',
    component: () => import('@/views/user/ProductsView.vue'),
    meta: { titleKey: 'titles.products' }
  },
  {
    path: '/products/:id',
    name: 'product-detail',
    component: () => import('@/views/user/ProductDetailView.vue'),
    meta: { titleKey: 'titles.productDetail' }
  },
  {
    path: '/orders',
    name: 'orders',
    component: () => import('@/views/user/OrdersView.vue'),
    meta: { titleKey: 'titles.orders', requiresAuth: true }
  },
  {
    path: '/orders/:id',
    name: 'order-detail',
    component: () => import('@/views/user/OrderDetailView.vue'),
    meta: { titleKey: 'titles.orderDetail', requiresAuth: true }
  },
  {
    path: '/orders/:id/pay',
    name: 'payment',
    component: () => import('@/views/user/PaymentView.vue'),
    meta: { titleKey: 'titles.payment', requiresAuth: true }
  },
  {
    path: '/forum',
    name: 'forum',
    component: () => import('@/views/user/ForumView.vue'),
    meta: { titleKey: 'titles.forum' }
  },
  {
    path: '/forum/post',
    name: 'forum-post',
    component: () => import('@/views/user/ForumPostView.vue'),
    meta: { titleKey: 'titles.forumNewPost', requiresAuth: true }
  },
  {
    path: '/forum/:id',
    name: 'forum-detail',
    component: () => import('@/views/user/ForumDetailView.vue'),
    meta: { titleKey: 'titles.forumPost' }
  },
  {
    path: '/chat',
    name: 'chat',
    component: () => import('@/views/user/ChatView.vue'),
    meta: { titleKey: 'titles.chat' }
  },
  {
    path: '/admin/chat',
    name: 'admin-chat',
    component: () => import('@/views/user/ChatAdminView.vue'),
    meta: { titleKey: 'titles.adminChat', requiresAdmin: true, layout: 'admin' }
  },

  // Admin routes
  {
    path: '/admin/login',
    name: 'admin-login',
    component: () => import('@/views/admin/LoginView.vue'),
    meta: { titleKey: 'titles.adminLogin', guest: true, layout: 'blank' }
  },
  {
    path: '/admin',
    name: 'admin-dashboard',
    component: () => import('@/views/admin/DashboardView.vue'),
    meta: { titleKey: 'titles.adminDashboard', requiresAdmin: true, layout: 'admin' }
  },
  {
    path: '/admin/users',
    name: 'admin-users',
    component: () => import('@/views/admin/UsersView.vue'),
    meta: { titleKey: 'titles.adminUsers', requiresAdmin: true, layout: 'admin' }
  },
  {
    path: '/admin/roles',
    name: 'admin-roles',
    component: () => import('@/views/admin/RolesView.vue'),
    meta: { titleKey: 'titles.adminRoles', requiresAdmin: true, layout: 'admin' }
  },
  {
    path: '/admin/agents',
    name: 'admin-agents',
    component: () => import('@/views/admin/AgentsView.vue'),
    meta: { titleKey: 'titles.adminAgents', requiresAdmin: true, layout: 'admin' }
  },
  {
    path: '/admin/users/edit/:id?',
    name: 'admin-user-form',
    component: () => import('@/views/admin/UserFormView.vue'),
    meta: { titleKey: 'titles.adminUserForm', requiresAdmin: true, layout: 'admin' }
  },
  {
    path: '/admin/products',
    name: 'admin-products',
    component: () => import('@/views/admin/ProductsView.vue'),
    meta: { titleKey: 'titles.adminProducts', requiresAdmin: true, layout: 'admin' }
  },
  {
    path: '/admin/products/add',
    name: 'admin-product-add',
    component: () => import('@/views/admin/ProductFormView.vue'),
    meta: { titleKey: 'titles.adminProductAdd', requiresAdmin: true, layout: 'admin' }
  },
  {
    path: '/admin/products/edit/:id',
    name: 'admin-product-edit',
    component: () => import('@/views/admin/ProductFormView.vue'),
    meta: { titleKey: 'titles.adminProductEdit', requiresAdmin: true, layout: 'admin' }
  },
  {
    path: '/admin/product-categories',
    name: 'admin-product-categories',
    component: () => import('@/views/admin/ProductCategoriesView.vue'),
    meta: { titleKey: 'titles.adminProductCategories', requiresAdmin: true, layout: 'admin' }
  },
  {
    path: '/admin/posts',
    name: 'admin-posts',
    component: () => import('@/views/admin/PostsView.vue'),
    meta: { titleKey: 'titles.adminPosts', requiresAdmin: true, layout: 'admin' }
  },
  {
    path: '/admin/posts/add',
    name: 'admin-post-add',
    component: () => import('@/views/admin/PostFormView.vue'),
    meta: { titleKey: 'titles.adminPostAdd', requiresAdmin: true, layout: 'admin' }
  },
  {
    path: '/admin/posts/edit/:id',
    name: 'admin-post-edit',
    component: () => import('@/views/admin/PostFormView.vue'),
    meta: { titleKey: 'titles.adminPostEdit', requiresAdmin: true, layout: 'admin' }
  },
  {
    path: '/admin/orders',
    name: 'admin-orders',
    component: () => import('@/views/admin/OrdersView.vue'),
    meta: { titleKey: 'titles.adminOrders', requiresAdmin: true, layout: 'admin' }
  },
  {
    path: '/admin/payment-settings',
    name: 'admin-payment-settings',
    component: () => import('@/views/admin/PaymentSettingsView.vue'),
    meta: { titleKey: 'titles.adminPaymentSettings', requiresAdmin: true, layout: 'admin' }
  },
  {
    path: '/admin/popup-notices',
    name: 'admin-popup-notices',
    component: () => import('@/views/admin/PopupNoticesView.vue'),
    meta: { titleKey: 'titles.adminPopupNotices', requiresAdmin: true, layout: 'admin' }
  },
  {
    path: '/admin/chat-settings',
    name: 'admin-chat-settings',
    component: () => import('@/views/admin/ChatSettingsView.vue'),
    meta: { titleKey: 'titles.adminChatSettings', requiresAdmin: true, layout: 'admin' }
  },
  {
    path: '/admin/device-verification',
    name: 'admin-device-verification',
    component: () => import('@/views/admin/DeviceVerificationView.vue'),
    meta: { titleKey: 'titles.adminDeviceVerification', requiresAdmin: true, layout: 'admin' }
  },
  {
    path: '/admin/questions',
    name: 'admin-questions',
    component: () => import('@/views/admin/QuestionsView.vue'),
    meta: { titleKey: 'titles.adminQuestions', requiresAdmin: true, layout: 'admin' }
  },
  {
    path: '/admin/questions/add',
    name: 'admin-question-add',
    component: () => import('@/views/admin/QuestionFormView.vue'),
    meta: { titleKey: 'titles.adminQuestionAdd', requiresAdmin: true, layout: 'admin' }
  },
  {
    path: '/admin/questions/edit/:id',
    name: 'admin-question-edit',
    component: () => import('@/views/admin/QuestionFormView.vue'),
    meta: { titleKey: 'titles.adminQuestionEdit', requiresAdmin: true, layout: 'admin' }
  },
  {
    path: '/admin/firmwares',
    name: 'admin-firmwares',
    component: () => import('@/views/admin/FirmwareView.vue'),
    meta: { titleKey: 'titles.adminFirmwares', requiresAdmin: true, layout: 'admin' }
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

// Navigation guards
router.beforeEach(async (to, from, next) => {
  setDocumentTitle(to, i18n.global.t)

  const authStore = useAuthStore()
  const adminStore = useAdminStore()
  const adminV2Store = useAdminV2Store()

  // Check auth status on first navigation
  if (!authStore.checked) {
    await authStore.checkAuth()
  }
  if (!adminStore.checked) {
    await adminStore.checkAuth()
  }
  // V2 权限须在页面渲染前就绪（v-permission / 角色模块 API）
  if (to.meta.requiresAdmin && !adminV2Store.checked) {
    await adminV2Store.checkAuth()
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
      const redirect = to.query.redirect
      if (typeof redirect === 'string' && isSafeInternalRedirect(redirect)) {
        return next(redirect)
      }
      return next({ name: 'home' })
    }
    if (authStore.isLoggedIn && to.name === 'register') {
      const redirect = to.query.redirect
      if (typeof redirect === 'string' && isSafeInternalRedirect(redirect)) {
        return next(redirect)
      }
      return next({ name: 'home' })
    }
    if (adminStore.isLoggedIn && to.name === 'admin-login' && to.query.reauth !== '1') {
      return next({ name: 'admin-dashboard' })
    }
  }

  // 代理不可进入产品分类管理
  if (to.name === 'admin-product-categories') {
    const user = adminV2Store.user
    const roles = user?.roles || []
    const isAgentOnly = roles.includes('agent') && !roles.includes('super_admin') && !user?.isAdmin
    if (isAgentOnly) {
      return next({ name: 'admin-products' })
    }
  }

  next()
})

export default router