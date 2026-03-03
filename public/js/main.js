// 导航栏移动端切换
document.addEventListener('DOMContentLoaded', function() {
    const navToggle = document.querySelector('.nav-toggle');
    const navMenu = document.querySelector('.nav-menu');
    
    if (navToggle) {
        navToggle.addEventListener('click', function() {
            navMenu.classList.toggle('active');
        });
    }

    // 点击外部关闭菜单
    document.addEventListener('click', function(event) {
        if (!event.target.closest('.navbar')) {
            navMenu.classList.remove('active');
        }
    });

    // 添加滚动动画
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver(function(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, observerOptions);

    // 观察所有卡片元素（排除论坛帖子卡片，避免影响链接点击）
    const cards = document.querySelectorAll('.feature-card, .product-card');
    cards.forEach(card => {
        card.style.opacity = '0';
        card.style.transform = 'translateY(30px)';
        card.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        observer.observe(card);
    });
    
    // 论坛帖子卡片使用简单的淡入效果，不影响链接
    const forumCards = document.querySelectorAll('.forum-post-card');
    forumCards.forEach(card => {
        card.style.opacity = '0';
        card.style.transition = 'opacity 0.3s ease';
        // 立即显示，不等待 IntersectionObserver
        setTimeout(() => {
            card.style.opacity = '1';
        }, 100);
    });

    // 粒子动画增强
    createParticles();
});

// 创建动态粒子效果
function createParticles() {
    const heroSection = document.querySelector('.hero-section');
    if (!heroSection) return;

    const particlesContainer = document.querySelector('.particles');
    if (!particlesContainer) return;

    // 创建额外的粒子元素
    for (let i = 0; i < 20; i++) {
        const particle = document.createElement('div');
        particle.style.position = 'absolute';
        particle.style.width = Math.random() * 4 + 2 + 'px';
        particle.style.height = particle.style.width;
        particle.style.background = 'rgba(0, 212, 255, 0.5)';
        particle.style.borderRadius = '50%';
        particle.style.left = Math.random() * 100 + '%';
        particle.style.top = Math.random() * 100 + '%';
        particle.style.animation = `float ${Math.random() * 3 + 2}s ease-in-out infinite`;
        particle.style.animationDelay = Math.random() * 2 + 's';
        particlesContainer.appendChild(particle);
    }
}

// 添加浮动动画
const style = document.createElement('style');
style.textContent = `
    @keyframes float {
        0%, 100% {
            transform: translateY(0) translateX(0);
            opacity: 0.5;
        }
        50% {
            transform: translateY(-20px) translateX(10px);
            opacity: 1;
        }
    }
`;
document.head.appendChild(style);

// 图片加载错误处理
function handleImageError(img) {
    // 创建SVG占位符
    const svg = `
        <svg width="400" height="300" xmlns="http://www.w3.org/2000/svg">
            <rect width="400" height="300" fill="#1a1f3a"/>
            <text x="50%" y="50%" font-family="Arial, sans-serif" font-size="18" fill="#00d4ff" text-anchor="middle" dominant-baseline="middle">
                图片加载失败
            </text>
        </svg>
    `;
    img.onerror = null; // 防止循环
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
    img.style.backgroundColor = '#1a1f3a';
}

// 为所有产品图片添加错误处理
document.addEventListener('DOMContentLoaded', function() {
    const productImages = document.querySelectorAll('.product-image img, .product-image-large img');
    productImages.forEach(img => {
        img.addEventListener('error', function() {
            handleImageError(this);
        });
        
        // 如果图片src为空或无效，立即显示占位符
        if (!img.src || img.src === window.location.href) {
            handleImageError(img);
        }
    });
});

// 表单验证增强
const forms = document.querySelectorAll('form');
forms.forEach(form => {
    form.addEventListener('submit', function(e) {
        const inputs = form.querySelectorAll('input[required], textarea[required]');
        let isValid = true;

        inputs.forEach(input => {
            if (!input.value.trim()) {
                isValid = false;
                input.style.borderColor = '#f72585';
            } else {
                input.style.borderColor = '';
            }
        });

        if (!isValid) {
            e.preventDefault();
            alert('请填写所有必填字段');
        }
    });
});


