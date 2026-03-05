<template>
  <AdminLayout>
    <template #header-title>Dashboard</template>

    <div class="dashboard-page">
      <!-- Stats Overview -->
      <div class="dashboard-stats">
        <div class="stat-card stat-users">
          <div class="stat-icon">
            <i class="fas fa-users"></i>
          </div>
          <div class="stat-content">
            <h3 class="stat-value">{{ stats.totalUsers }}</h3>
            <p class="stat-label">Total Users</p>
          </div>
          <div class="stat-trend positive">
            <i class="fas fa-arrow-up"></i>
            <span>Active</span>
          </div>
        </div>

        <div class="stat-card stat-products">
          <div class="stat-icon">
            <i class="fas fa-box"></i>
          </div>
          <div class="stat-content">
            <h3 class="stat-value">{{ stats.totalProducts }}</h3>
            <p class="stat-label">Total Products</p>
          </div>
          <div class="stat-trend">
            <i class="fas fa-cube"></i>
            <span>In Catalog</span>
          </div>
        </div>

        <div class="stat-card stat-posts">
          <div class="stat-icon">
            <i class="fas fa-comments"></i>
          </div>
          <div class="stat-content">
            <h3 class="stat-value">{{ stats.totalPosts }}</h3>
            <p class="stat-label">Forum Posts</p>
          </div>
          <div class="stat-trend">
            <i class="fas fa-comment-dots"></i>
            <span>Discussions</span>
          </div>
        </div>

        <div class="stat-card stat-orders">
          <div class="stat-icon">
            <i class="fas fa-shopping-cart"></i>
          </div>
          <div class="stat-content">
            <h3 class="stat-value">{{ stats.totalOrders }}</h3>
            <p class="stat-label">Total Orders</p>
          </div>
          <div v-if="stats.pendingOrders > 0" class="stat-trend warning">
            <i class="fas fa-clock"></i>
            <span>{{ stats.pendingOrders }} Pending</span>
          </div>
        </div>

        <div class="stat-card stat-pending">
          <div class="stat-icon">
            <i class="fas fa-hourglass-half"></i>
          </div>
          <div class="stat-content">
            <h3 class="stat-value">{{ stats.pendingOrders }}</h3>
            <p class="stat-label">Pending Orders</p>
          </div>
          <div class="stat-trend warning">
            <i class="fas fa-exclamation-circle"></i>
            <span>Needs Action</span>
          </div>
        </div>

        <div class="stat-card stat-revenue">
          <div class="stat-icon">
            <i class="fas fa-dollar-sign"></i>
          </div>
          <div class="stat-content">
            <h3 class="stat-value">{{ stats.totalRevenue.toFixed(2) }}</h3>
            <p class="stat-label">Total Revenue (USDT)</p>
          </div>
          <div class="stat-trend positive">
            <i class="fas fa-chart-line"></i>
            <span>Growing</span>
          </div>
        </div>
      </div>

      <!-- Quick Actions -->
      <div class="dashboard-actions">
        <h2 class="section-title">
          <i class="fas fa-bolt"></i> Quick Actions
        </h2>
        <div class="actions-grid">
          <router-link to="/admin/users" class="action-card">
            <div class="action-icon users">
              <i class="fas fa-user-plus"></i>
            </div>
            <h3>User Management</h3>
            <p>Manage user accounts and permissions</p>
            <div class="action-link">
              Manage Users <i class="fas fa-arrow-right"></i>
            </div>
          </router-link>

          <router-link to="/admin/products" class="action-card">
            <div class="action-icon products">
              <i class="fas fa-box-open"></i>
            </div>
            <h3>Product Management</h3>
            <p>Add, edit or remove products from catalog</p>
            <div class="action-link">
              Manage Products <i class="fas fa-arrow-right"></i>
            </div>
          </router-link>

          <router-link to="/admin/posts" class="action-card">
            <div class="action-icon posts">
              <i class="fas fa-edit"></i>
            </div>
            <h3>Forum Management</h3>
            <p>Moderate posts and discussions</p>
            <div class="action-link">
              Manage Forum <i class="fas fa-arrow-right"></i>
            </div>
          </router-link>

          <router-link to="/admin/orders" class="action-card">
            <div class="action-icon orders">
              <i class="fas fa-receipt"></i>
            </div>
            <h3>Order Management</h3>
            <p>Process and track customer orders</p>
            <div class="action-link">
              Manage Orders <i class="fas fa-arrow-right"></i>
            </div>
          </router-link>
        </div>
      </div>

      <!-- System Status -->
      <div class="dashboard-status">
        <h2 class="section-title">
          <i class="fas fa-heartbeat"></i> System Status
        </h2>
        <div class="status-grid">
          <div class="status-item">
            <div class="status-indicator online"></div>
            <span>API Server</span>
            <span class="status-badge success">Online</span>
          </div>
          <div class="status-item">
            <div class="status-indicator online"></div>
            <span>Database</span>
            <span class="status-badge success">Connected</span>
          </div>
          <div class="status-item">
            <div class="status-indicator online"></div>
            <span>Forum Module</span>
            <span class="status-badge success">Active</span>
          </div>
          <div class="status-item">
            <div class="status-indicator online"></div>
            <span>Payment System</span>
            <span class="status-badge success">Enabled</span>
          </div>
        </div>
      </div>
    </div>
  </AdminLayout>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import api from '@/services/api'
import AdminLayout from '@/components/admin/AdminLayout.vue'

const stats = ref({
  totalUsers: 0,
  totalProducts: 0,
  totalPosts: 0,
  totalOrders: 0,
  pendingOrders: 0,
  totalRevenue: 0
})
const loading = ref(true)

onMounted(async () => {
  try {
    const response = await api.get('/api/admin/stats')
    stats.value = response.data
  } catch (error) {
    console.error('Failed to fetch stats:', error)
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.dashboard-page {
  animation: fadeIn 0.5s ease;
}

/* Stats Grid */
.dashboard-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1.5rem;
  margin-bottom: 2.5rem;
}

.stat-card {
  background: var(--bg-card);
  padding: 1.5rem;
  border-radius: 12px;
  border: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  gap: 1.25rem;
  transition: all 0.3s ease;
  position: relative;
  overflow: hidden;
}

.stat-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 4px;
  height: 100%;
  background: var(--gradient-3);
}

.stat-card.stat-users::before { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
.stat-card.stat-products::before { background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); }
.stat-card.stat-posts::before { background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); }
.stat-card.stat-orders::before { background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%); }
.stat-card.stat-pending::before { background: linear-gradient(135deg, #fa709a 0%, #fee140 100%); }
.stat-card.stat-revenue::before { background: linear-gradient(135deg, #30cfd0 0%, #330867 100%); }

.stat-card:hover {
  transform: translateY(-5px);
  box-shadow: 0 10px 30px rgba(0, 212, 255, 0.15);
  border-color: var(--primary-color);
}

.stat-icon {
  width: 60px;
  height: 60px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
  flex-shrink: 0;
}

.stat-users .stat-icon { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
.stat-products .stat-icon { background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); }
.stat-posts .stat-icon { background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); }
.stat-orders .stat-icon { background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%); }
.stat-pending .stat-icon { background: linear-gradient(135deg, #fa709a 0%, #fee140 100%); }
.stat-revenue .stat-icon { background: linear-gradient(135deg, #30cfd0 0%, #330867 100%); }

.stat-icon i {
  color: white;
}

.stat-content {
  flex: 1;
}

.stat-value {
  margin: 0;
  font-size: 2rem;
  font-weight: 700;
  color: var(--text-primary);
}

.stat-label {
  margin: 0.25rem 0 0 0;
  color: var(--text-secondary);
  font-size: 0.9rem;
}

.stat-trend {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.8rem;
  padding: 0.35rem 0.6rem;
  border-radius: 6px;
  background: rgba(0, 212, 255, 0.1);
  color: var(--primary-color);
}

.stat-trend.positive {
  background: rgba(67, 233, 123, 0.15);
  color: #43e97b;
}

.stat-trend.warning {
  background: rgba(250, 112, 154, 0.15);
  color: #fa709a;
}

/* Actions Section */
.dashboard-actions {
  margin-bottom: 2.5rem;
}

.section-title {
  font-size: 1.3rem;
  margin-bottom: 1.5rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--text-primary);
}

.section-title i {
  color: var(--primary-color);
}

.actions-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 1.5rem;
}

.action-card {
  background: var(--bg-card);
  padding: 1.5rem;
  border-radius: 12px;
  border: 1px solid var(--border-color);
  text-decoration: none;
  color: var(--text-primary);
  transition: all 0.3s ease;
}

.action-card:hover {
  transform: translateY(-5px);
  border-color: var(--primary-color);
  box-shadow: 0 10px 30px rgba(0, 212, 255, 0.15);
}

.action-icon {
  width: 50px;
  height: 50px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.25rem;
  margin-bottom: 1rem;
}

.action-icon.users { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
.action-icon.products { background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); }
.action-icon.posts { background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); }
.action-icon.orders { background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%); }

.action-icon i {
  color: white;
}

.action-card h3 {
  margin: 0 0 0.5rem 0;
  font-size: 1.1rem;
}

.action-card p {
  margin: 0 0 1rem 0;
  color: var(--text-secondary);
  font-size: 0.9rem;
  line-height: 1.5;
}

.action-link {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--primary-color);
  font-weight: 500;
  font-size: 0.9rem;
}

.action-link i {
  transition: transform 0.3s ease;
}

.action-card:hover .action-link i {
  transform: translateX(5px);
}

/* Status Section */
.dashboard-status {
  margin-bottom: 2rem;
}

.status-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
}

.status-item {
  background: var(--bg-card);
  padding: 1rem 1.25rem;
  border-radius: 10px;
  border: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.status-indicator {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--text-secondary);
}

.status-indicator.online {
  background: #43e97b;
  box-shadow: 0 0 10px rgba(67, 233, 123, 0.5);
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.status-item span:first-of-type {
  flex: 1;
  font-weight: 500;
}

.status-badge {
  font-size: 0.75rem;
  padding: 0.25rem 0.6rem;
  border-radius: 4px;
  font-weight: 500;
}

.status-badge.success {
  background: rgba(67, 233, 123, 0.15);
  color: #43e97b;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 768px) {
  .dashboard-stats {
    grid-template-columns: 1fr;
  }

  .actions-grid {
    grid-template-columns: 1fr;
  }

  .status-grid {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
