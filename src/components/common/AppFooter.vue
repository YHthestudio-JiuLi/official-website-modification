<template>
  <footer class="footer">
    <div class="container">
      <div class="footer-content">
        <div class="footer-brand">
          <h3>
            <img src="/favicon.png" alt="YHthestudio" class="footer-brand-icon" width="28" height="28" />
            YHthestudio
          </h3>
          <p>Professional Digital Solutions</p>
        </div>
        <div class="footer-sections">
          <div class="footer-section">
            <h4>Explore</h4>
            <nav>
              <router-link to="/products">Products</router-link>
              <router-link to="/forum">Forum</router-link>
            </nav>
          </div>
        </div>
      </div>
      <div class="footer-bottom">
        <p>&copy; {{ new Date().getFullYear() }} YHthestudio. All rights reserved.</p>
      </div>
    </div>
  </footer>
</template>

<script setup>
</script>

<style scoped>
.footer {
  /* 上沿与商品详情主底色 #0b0f15 同色衔接，再向下过渡到深蓝，避免与主内容之间「断层」 */
  background: linear-gradient(180deg, #0b0f15 0%, #0b0f15 12%, #0f1222 38%, #1a1f3a 100%);
  border-top: none;
  padding: 2rem 0;
  margin-top: auto;
}

/* 与全站 .container 同宽同边距，与顶栏、正文列对齐 */
.container {
  max-width: var(--layout-content-max);
  margin: 0 auto;
  padding-left: var(--layout-content-pad-x);
  padding-right: var(--layout-content-pad-x);
  box-sizing: border-box;
}

.footer-content {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 2rem;
  padding-bottom: 2rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.footer-brand h3 {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: #00d4ff;
  font-size: 1.5rem;
  margin: 0 0 0.5rem 0;
}

.footer-brand-icon {
  width: 1.75rem;
  height: 1.75rem;
  object-fit: contain;
  flex-shrink: 0;
}

.footer-brand p {
  color: #8892b0;
  font-size: 0.9rem;
  margin: 0;
}

.footer-sections {
  display: flex;
  gap: 4rem;
}

.footer-section h4 {
  color: #ccd6f6;
  font-size: 1rem;
  margin: 0 0 1rem 0;
  font-weight: 600;
}

.footer-section nav {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.footer-section nav a {
  color: #8892b0;
  text-decoration: none;
  font-size: 0.9rem;
  transition: all 0.3s ease;
}

.footer-section nav a:hover {
  color: #00d4ff;
  transform: translateX(5px);
}

.footer-bottom {
  padding-top: 1.5rem;
  text-align: center;
}

.footer-bottom p {
  color: #5a6478;
  font-size: 0.85rem;
  margin: 0;
}

@media (max-width: 768px) {
  .footer-content {
    flex-direction: column;
    text-align: center;
  }

  .footer-sections {
    justify-content: center;
    gap: 2rem;
  }

  .footer {
    padding: 1.5rem 0;
  }

}
</style>