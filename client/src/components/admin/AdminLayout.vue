<template>
  <div class="admin-layout" :class="{ 'sidebar-collapsed': collapsed, 'sidebar-mobile-open': mobileOpen }">
    <!-- Sidebar -->
    <aside class="admin-sidebar">
      <div class="sidebar-header">
        <router-link to="/admin" class="sidebar-brand">
          <i class="fas fa-shield-alt"></i>
          <span v-show="!collapsed">YHthestudio</span>
        </router-link>
      </div>

      <nav class="sidebar-nav">
        <div class="nav-section" v-show="!collapsed">
          <div class="nav-section-title">
            <i class="fas fa-chart-line"></i> Overview
          </div>
          <router-link to="/admin" class="nav-link" :class="{ active: isActive('/admin') }">
            <i class="fas fa-tachometer-alt"></i>
            <span>Dashboard</span>
          </router-link>
        </div>
        <router-link to="/admin" class="nav-link" :class="{ active: isActive('/admin') }" v-show="collapsed" title="Dashboard">
          <i class="fas fa-tachometer-alt"></i>
        </router-link>

        <div class="nav-section" v-show="!collapsed">
          <div class="nav-section-title">
            <i class="fas fa-users"></i> User Management
          </div>
          <router-link to="/admin/users" class="nav-link" :class="{ active: isActive('/admin/users') }">
            <i class="fas fa-user-friends"></i>
            <span>Users</span>
          </router-link>
        </div>
        <router-link to="/admin/users" class="nav-link" :class="{ active: isActive('/admin/users') }" v-show="collapsed" title="Users">
          <i class="fas fa-user-friends"></i>
        </router-link>

        <div class="nav-section" v-show="!collapsed">
          <div class="nav-section-title">
            <i class="fas fa-box"></i> Product Management
          </div>
          <router-link to="/admin/products" class="nav-link" :class="{ active: isActive('/admin/products') }">
            <i class="fas fa-box-open"></i>
            <span>Products</span>
          </router-link>
        </div>
        <router-link to="/admin/products" class="nav-link" :class="{ active: isActive('/admin/products') }" v-show="collapsed" title="Products">
          <i class="fas fa-box-open"></i>
        </router-link>

        <div class="nav-section" v-show="!collapsed">
          <div class="nav-section-title">
            <i class="fas fa-comments"></i> Forum Management
          </div>
          <router-link to="/admin/posts" class="nav-link" :class="{ active: isActive('/admin/posts') }">
            <i class="fas fa-newspaper"></i>
            <span>Posts</span>
          </router-link>
        </div>
        <router-link to="/admin/posts" class="nav-link" :class="{ active: isActive('/admin/posts') }" v-show="collapsed" title="Posts">
          <i class="fas fa-newspaper"></i>
        </router-link>

        <div class="nav-section" v-show="!collapsed">
          <div class="nav-section-title">
            <i class="fas fa-shopping-cart"></i> Order Management
          </div>
          <router-link to="/admin/orders" class="nav-link" :class="{ active: isActive('/admin/orders') }">
            <i class="fas fa-receipt"></i>
            <span>Orders</span>
          </router-link>
        </div>
        <router-link to="/admin/orders" class="nav-link" :class="{ active: isActive('/admin/orders') }" v-show="collapsed" title="Orders">
          <i class="fas fa-receipt"></i>
        </router-link>

        <div class="nav-section" v-show="!collapsed">
          <div class="nav-section-title">
            <i class="fas fa-cog"></i> Settings
          </div>
          <router-link to="/admin/payment-settings" class="nav-link" :class="{ active: isActive('/admin/payment-settings') }">
            <i class="fas fa-wallet"></i>
            <span>Payment</span>
          </router-link>
        </div>
        <router-link to="/admin/payment-settings" class="nav-link" :class="{ active: isActive('/admin/payment-settings') }" v-show="collapsed" title="Payment Settings">
          <i class="fas fa-wallet"></i>
        </router-link>
      </nav>

      <div class="sidebar-footer">
        <a href="/" class="nav-link" target="_blank" v-show="!collapsed">
          <i class="fas fa-external-link-alt"></i>
          <span>View Site</span>
        </a>
        <a href="/" class="nav-link" target="_blank" v-show="collapsed" title="View Site">
          <i class="fas fa-external-link-alt"></i>
        </a>
        <button @click="handleLogout" class="nav-link logout-link" v-show="!collapsed">
          <i class="fas fa-sign-out-alt"></i>
          <span>Logout</span>
        </button>
        <button @click="handleLogout" class="nav-link logout-link" v-show="collapsed" title="Logout">
          <i class="fas fa-sign-out-alt"></i>
        </button>
      </div>
    </aside>

    <!-- Main Content -->
    <div class="admin-main">
      <header class="admin-header">
        <div class="header-left">
          <button class="sidebar-toggle-btn" @click="toggleCollapse" :title="collapsed ? 'Expand sidebar (E)' : 'Collapse sidebar (E)'">
            <i class="fas fa-angles-left" :class="{'icon-hidden': collapsed}"></i>
            <i class="fas fa-angles-right" :class="{'icon-hidden': !collapsed}"></i>
          </button>
          <h1 class="header-title">
            <slot name="header-title">Admin Panel</slot>
          </h1>
        </div>
        <div class="header-right">
          <span class="admin-info">
            <i class="fas fa-user-circle"></i>
            <span class="admin-name">{{ adminStore.username || 'Admin' }}</span>
          </span>
        </div>
      </header>

      <main class="admin-content">
        <slot />
      </main>
    </div>

    <!-- Mobile Overlay -->
    <div v-if="mobileOpen" class="sidebar-overlay" @click="mobileOpen = false"></div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAdminStore } from '@/stores/admin'

const route = useRoute()
const router = useRouter()
const adminStore = useAdminStore()

const collapsed = ref(false)
const mobileOpen = ref(false)

function isActive(path) {
  if (path === '/admin') {
    return route.path === '/admin'
  }
  return route.path.startsWith(path)
}

function toggleCollapse() {
  collapsed.value = !collapsed.value
  localStorage.setItem('sidebar-collapsed', collapsed.value ? '1' : '0')
}

async function handleLogout() {
  await adminStore.logout()
  router.push('/admin/login')
}

// Handle keyboard shortcut
function handleKeyDown(e) {
  if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
    e.preventDefault()
    toggleCollapse()
  }
}

// Handle responsive
function handleResize() {
  if (window.innerWidth < 992) {
    collapsed.value = false
  }
}

onMounted(() => {
  // Restore sidebar state from localStorage
  const savedState = localStorage.getItem('sidebar-collapsed')
  if (savedState === '1') {
    collapsed.value = true
  }
  
  window.addEventListener('resize', handleResize)
  window.addEventListener('keydown', handleKeyDown)
  handleResize()
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  window.removeEventListener('keydown', handleKeyDown)
})
</script>

<style scoped>
.admin-layout {
  display: flex;
  min-height: 100vh;
  background: var(--bg-dark);
}

/* Sidebar Styles */
.sidebar-header {
  padding: 1.25rem 1rem;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: flex-start;
  flex-shrink: 0;
}

.admin-sidebar {
  width: 260px;
  background: var(--bg-card);
  border-right: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  position: fixed;
  height: 100vh;
  overflow-y: auto;
  overflow-x: hidden;
  z-index: 100;
  transition: width 0.3s ease;
  flex-shrink: 0;
}

.admin-sidebar::-webkit-scrollbar {
  width: 6px;
}

.admin-sidebar::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: 3px;
}

.sidebar-brand {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 1.4rem;
  font-weight: bold;
  background: var(--gradient-3);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  text-decoration: none;
  overflow: hidden;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

.sidebar-brand i {
  font-size: 1.6rem;
  flex-shrink: 0;
}

.sidebar-nav {
  flex: 1;
  padding: 0.75rem 0;
  overflow-y: auto;
}

.nav-link {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  margin: 0.125rem 0.5rem;
  border-radius: 8px;
  color: var(--text-secondary);
  text-decoration: none;
  transition: all 0.2s ease;
  border-left: 3px solid transparent;
  background: none;
  border: none;
  font-size: 0.9rem;
  cursor: pointer;
  width: auto;
  text-align: left;
  overflow: hidden;
  white-space: nowrap;
}

.nav-link:hover {
  background: rgba(0, 212, 255, 0.08);
  color: var(--primary-color);
}

.nav-link.active {
  background: rgba(0, 212, 255, 0.12);
  color: var(--primary-color);
  border-left-color: var(--primary-color);
}

.nav-link i {
  width: 20px;
  text-align: center;
  font-size: 1rem;
  flex-shrink: 0;
}

.nav-section {
  margin-top: 1rem;
  padding: 0 0.5rem;
}

.nav-section-title {
  padding: 0.5rem 1rem;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--text-secondary);
  letter-spacing: 0.5px;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.nav-section-title i {
  font-size: 0.8rem;
}

.sidebar-footer {
  padding: 0.75rem 0;
  border-top: 1px solid var(--border-color);
  flex-shrink: 0;
}

.logout-link {
  color: #f5576c;
}

.logout-link:hover {
  background: rgba(245, 87, 108, 0.1);
  color: #f5576c;
}

/* Collapsed State */
.admin-layout.sidebar-collapsed .admin-sidebar {
  width: 70px;
}

.admin-layout.sidebar-collapsed .sidebar-header {
  justify-content: center;
  padding: 1rem 0.5rem;
}

.admin-layout.sidebar-collapsed .sidebar-brand {
  display: none;
}

.admin-layout.sidebar-collapsed .nav-link {
  justify-content: center;
  padding: 0.75rem;
  margin: 0.125rem 0;
}

.admin-layout.sidebar-collapsed .nav-link span {
  display: none;
}

.admin-layout.sidebar-collapsed .nav-section {
  display: none;
}

.admin-layout.sidebar-collapsed .sidebar-footer {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.admin-layout.sidebar-collapsed .sidebar-footer .nav-link {
  justify-content: center;
}

.admin-layout.sidebar-collapsed .sidebar-footer span {
  display: none;
}

/* Main Content */
.admin-main {
  flex: 1;
  margin-left: 260px;
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  transition: margin-left 0.3s ease;
  min-width: 0;
}

.admin-layout.sidebar-collapsed .admin-main {
  margin-left: 70px;
}

.admin-header {
  background: var(--bg-card);
  padding: 1rem 1.5rem;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
  position: sticky;
  top: 0;
  z-index: 50;
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 1rem;
  min-width: 0;
  flex: 1;
}

.sidebar-toggle-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  background: rgba(0, 212, 255, 0.1);
  border: none;
  border-radius: 8px;
  color: var(--primary-color);
  cursor: pointer;
  transition: all 0.2s ease;
  flex-shrink: 0;
  position: relative;
}

.sidebar-toggle-btn i {
  font-size: 1rem;
  position: absolute;
  transition: all 0.2s ease;
}

.sidebar-toggle-btn i.icon-hidden {
  opacity: 0;
  transform: scale(0.5);
}

.sidebar-toggle-btn:hover {
  background: rgba(0, 212, 255, 0.2);
  transform: scale(1.05);
}

/* Tooltip for collapsed sidebar */
.admin-layout.sidebar-collapsed .nav-link {
  position: relative;
}

.admin-layout.sidebar-collapsed .nav-link::after {
  content: attr(title);
  position: absolute;
  left: 100%;
  top: 50%;
  transform: translateY(-50%) translateX(10px);
  background: var(--bg-darker);
  color: var(--text-primary);
  padding: 0.5rem 0.75rem;
  border-radius: 6px;
  font-size: 0.8rem;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transition: all 0.2s ease;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  border: 1px solid var(--border-color);
  z-index: 1000;
}

.admin-layout.sidebar-collapsed .nav-link:hover::after {
  opacity: 1;
  transform: translateY(-50%) translateX(15px);
}

.header-title {
  margin: 0;
  font-size: 1.3rem;
  background: var(--gradient-3);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  flex: 1;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-shrink: 0;
}

.admin-info {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--text-secondary);
  padding: 0.5rem 1rem;
  background: rgba(0, 212, 255, 0.08);
  border-radius: 8px;
}

.admin-info i {
  font-size: 1.2rem;
  color: var(--primary-color);
}

.admin-name {
  font-weight: 500;
}

.admin-content {
  flex: 1;
  padding: 1.5rem;
  overflow-x: auto;
  overflow-y: visible;
  min-width: 0;
  width: 100%;
}

.sidebar-overlay {
  display: none;
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  z-index: 99;
}

/* Responsive */
@media (max-width: 992px) {
  .admin-sidebar {
    transform: translateX(-100%);
    transition: transform 0.3s ease;
  }

  .admin-sidebar.mobile-open {
    transform: translateX(0);
  }

  .admin-main {
    margin-left: 0 !important;
  }

  .sidebar-toggle-btn {
    display: flex;
  }

  .sidebar-overlay.show {
    display: block;
  }

  .admin-header {
    padding: 0.75rem 1rem;
  }

  .admin-content {
    padding: 1rem;
  }

  .admin-name {
    display: none;
  }
}

@media (max-width: 576px) {
  .header-title {
    font-size: 1rem;
  }

  .admin-info {
    padding: 0.4rem 0.75rem;
    font-size: 0.85rem;
  }

  .admin-content {
    padding: 0.75rem;
  }
}
</style>
