import { createRouter, createWebHashHistory } from 'vue-router'
import { ref } from 'vue'
import { setDocumentTitle } from '@/utils/documentTitle'
import { isSafeInternalRedirect } from '@/utils/authRedirect'
import { useAuthStore } from '@/stores/auth'
import { useAdminStore } from '@/stores/admin'
import { useAdminV2Store } from '@/stores/adminV2'
import { useV2Api } from '@/utils/apiPath'
import { ensureElementPlus, isElementPlusReady } from '@/plugins/elementPlus'
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
    path: '/checkout/pay',
    name: 'checkout-pay',
    component: () => import('@/views/user/PaymentView.vue'),
    meta: { titleKey: 'titles.checkout', requiresAuth: true, paymentMode: 'checkout' }
  },
  {
    path: '/orders/:id/pay',
    name: 'payment',
    component: () => import('@/views/user/PaymentView.vue'),
    meta: { titleKey: 'titles.payment', requiresAuth: true, paymentMode: 'legacy' }
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

  // Admin routes（侧栏壳层复用，子路由只换内容区）
  {
    path: '/admin/login',
    name: 'admin-login',
    component: () => import('@/views/admin/LoginView.vue'),
    meta: { titleKey: 'titles.adminLogin', guest: true, layout: 'blank' }
  },
  {
    path: '/admin',
    component: () => import('@/views/admin/AdminShellView.vue'),
    meta: { requiresAdmin: true, layout: 'admin' },
    children: [
      {
        path: '',
        name: 'admin-dashboard',
        component: () => import('@/views/admin/DashboardView.vue'),
        meta: { titleKey: 'titles.adminDashboard' }
      },
      {
        path: 'users',
        name: 'admin-users',
        component: () => import('@/views/admin/UsersView.vue'),
        meta: { titleKey: 'titles.adminUsers' }
      },
      {
        path: 'users/edit/:id?',
        name: 'admin-user-form',
        component: () => import('@/views/admin/UserFormView.vue'),
        meta: { titleKey: 'titles.adminUserForm' }
      },
      {
        path: 'roles',
        name: 'admin-roles',
        component: () => import('@/views/admin/RolesView.vue'),
        meta: { titleKey: 'titles.adminRoles' }
      },
      {
        path: 'agents',
        name: 'admin-agents',
        component: () => import('@/views/admin/AgentsView.vue'),
        meta: { titleKey: 'titles.adminAgents' }
      },
      {
        path: 'products',
        name: 'admin-products',
        component: () => import('@/views/admin/ProductsView.vue'),
        meta: { titleKey: 'titles.adminProducts' }
      },
      {
        path: 'products/add',
        name: 'admin-product-add',
        component: () => import('@/views/admin/ProductFormView.vue'),
        meta: { titleKey: 'titles.adminProductAdd' }
      },
      {
        path: 'products/edit/:id',
        name: 'admin-product-edit',
        component: () => import('@/views/admin/ProductFormView.vue'),
        meta: { titleKey: 'titles.adminProductEdit' }
      },
      {
        path: 'product-categories',
        name: 'admin-product-categories',
        component: () => import('@/views/admin/ProductCategoriesView.vue'),
        meta: { titleKey: 'titles.adminProductCategories' }
      },
      {
        path: 'posts',
        name: 'admin-posts',
        component: () => import('@/views/admin/PostsView.vue'),
        meta: { titleKey: 'titles.adminPosts' }
      },
      {
        path: 'posts/add',
        name: 'admin-post-add',
        component: () => import('@/views/admin/PostFormView.vue'),
        meta: { titleKey: 'titles.adminPostAdd' }
      },
      {
        path: 'posts/edit/:id',
        name: 'admin-post-edit',
        component: () => import('@/views/admin/PostFormView.vue'),
        meta: { titleKey: 'titles.adminPostEdit' }
      },
      {
        path: 'orders',
        name: 'admin-orders',
        component: () => import('@/views/admin/OrdersView.vue'),
        meta: { titleKey: 'titles.adminOrders' }
      },
      {
        path: 'payment-settings',
        name: 'admin-payment-settings',
        component: () => import('@/views/admin/PaymentSettingsView.vue'),
        meta: { titleKey: 'titles.adminPaymentSettings' }
      },
      {
        path: 'popup-notices',
        name: 'admin-popup-notices',
        component: () => import('@/views/admin/PopupNoticesView.vue'),
        meta: { titleKey: 'titles.adminPopupNotices' }
      },
      {
        path: 'chat-settings',
        name: 'admin-chat-settings',
        component: () => import('@/views/admin/ChatSettingsView.vue'),
        meta: { titleKey: 'titles.adminChatSettings' }
      },
      {
        path: 'device-verification',
        name: 'admin-device-verification',
        component: () => import('@/views/admin/DeviceVerificationView.vue'),
        meta: { titleKey: 'titles.adminDeviceVerification' }
      },
      {
        path: 'questions',
        name: 'admin-questions',
        component: () => import('@/views/admin/QuestionsView.vue'),
        meta: { titleKey: 'titles.adminQuestions' }
      },
      {
        path: 'questions/add',
        name: 'admin-question-add',
        component: () => import('@/views/admin/QuestionFormView.vue'),
        meta: { titleKey: 'titles.adminQuestionAdd' }
      },
      {
        path: 'questions/edit/:id',
        name: 'admin-question-edit',
        component: () => import('@/views/admin/QuestionFormView.vue'),
        meta: { titleKey: 'titles.adminQuestionEdit' }
      },
      {
        path: 'firmwares',
        name: 'admin-firmwares',
        component: () => import('@/views/admin/FirmwareView.vue'),
        meta: { titleKey: 'titles.adminFirmwares' }
      },
      {
        path: 'chat',
        name: 'admin-chat',
        component: () => import('@/views/user/ChatAdminView.vue'),
        meta: { titleKey: 'titles.adminChat' }
      }
    ]
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

/** 路由守卫鉴权期间显示全局加载态，避免长时间白屏 */
export const isRouterPending = ref(false)

// Navigation guards
router.beforeEach(async (to, from, next) => {
  setDocumentTitle(to, i18n.global.t)

  const authStore = useAuthStore()
  const adminStore = useAdminStore()
  const adminV2Store = useAdminV2Store()

  const isAdminArea = to.path.startsWith('/admin') || to.name === 'admin-login'
  const mustCheckUserAuth =
    !isAdminArea &&
    !authStore.checked &&
    (to.meta.requiresAuth || to.meta.guest)

  const bootstrapTasks = []

  if (mustCheckUserAuth) {
    bootstrapTasks.push(authStore.checkAuth())
  } else if (!authStore.checked && !isAdminArea) {
    // 公开页不阻塞导航，异步补全会话供顶栏登录态展示
    authStore.checkAuth()
  }

  if (!useV2Api() && !adminStore.checked && isAdminArea) {
    bootstrapTasks.push(adminStore.checkAuth())
  }

  if (to.meta.requiresAdmin) {
    if (useV2Api() && !adminV2Store.checked) {
      bootstrapTasks.push(adminV2Store.checkAuth())
    }
    if (!isElementPlusReady()) {
      bootstrapTasks.push(ensureElementPlus())
    } else {
      ensureElementPlus()
    }
  }

  if (bootstrapTasks.length > 0) {
    isRouterPending.value = true
    try {
      await Promise.all(bootstrapTasks)
    } finally {
      isRouterPending.value = false
    }
  }

  // Routes requiring user authentication
  if (to.meta.requiresAuth && !authStore.isLoggedIn) {
    return next({ name: 'login', query: { redirect: to.fullPath } })
  }

  // Routes requiring admin authentication
  const adminAuthed = useV2Api() ? adminV2Store.isLoggedIn : adminStore.isLoggedIn
  if (to.meta.requiresAdmin && !adminAuthed) {
    return next({
      name: 'admin-login',
      query: { redirect: to.fullPath, reauth: '1' }
    })
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
    if ((useV2Api() ? adminV2Store.isLoggedIn : adminStore.isLoggedIn) && to.name === 'admin-login' && to.query.reauth !== '1') {
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

router.afterEach(() => {
  isRouterPending.value = false
})

router.onError(() => {
  isRouterPending.value = false
})

export default router