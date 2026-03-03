// 管理后台 JavaScript

document.addEventListener('DOMContentLoaded', function() {
    // 图片预览功能
    const imageInput = document.getElementById('image');
    if (imageInput) {
        imageInput.addEventListener('input', function() {
            const url = this.value;
            if (url) {
                let preview = document.querySelector('.image-preview');
                if (!preview) {
                    preview = document.createElement('div');
                    preview.className = 'image-preview';
                    this.parentElement.appendChild(preview);
                }
                preview.innerHTML = `<img src="${url}" alt="预览" onerror="this.parentElement.remove()">`;
            }
        });
    }

    // 表单验证
    const forms = document.querySelectorAll('.admin-form');
    forms.forEach(form => {
        form.addEventListener('submit', function(e) {
            const requiredInputs = form.querySelectorAll('[required]');
            let isValid = true;

            requiredInputs.forEach(input => {
                if (!input.value.trim()) {
                    isValid = false;
                    input.style.borderColor = '#f5576c';
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

    // 表格行点击效果
    const tableRows = document.querySelectorAll('.admin-table tbody tr');
    tableRows.forEach(row => {
        row.addEventListener('click', function(e) {
            // 如果点击的是按钮或链接，不触发
            if (e.target.tagName === 'BUTTON' || e.target.tagName === 'A' || e.target.closest('button') || e.target.closest('a')) {
                return;
            }
            // 可以在这里添加行点击的交互效果
        });
    });

    // 自动刷新未读消息计数（可选）
    if (window.location.pathname === '/admin') {
        // 可以添加自动刷新功能
    }
});





















