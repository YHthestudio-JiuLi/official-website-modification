// 简单的 i18n 实现
const fs = require('fs');
const path = require('path');

const localesDir = path.join(__dirname, 'locales');
let translations = {};

// 加载所有语言文件
function loadTranslations() {
    const files = fs.readdirSync(localesDir);
    files.forEach(file => {
        if (file.endsWith('.json')) {
            let lang = file.replace('.json', '');
            // 处理 frontend-en.json 这样的文件名
            if (lang.startsWith('frontend-')) {
                lang = lang.replace('frontend-', '');
            }
            const filePath = path.join(localesDir, file);
            try {
                const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                if (translations[lang]) {
                    // 合并前端和后端翻译
                    translations[lang] = { ...translations[lang], ...content };
                } else {
                    translations[lang] = content;
                }
            } catch (error) {
                console.error(`Error loading locale file ${file}:`, error);
            }
        }
    });
}

// 初始化加载
loadTranslations();

// 获取翻译文本（支持嵌套路径，如 'admin.dashboard.title'）
function t(key, lang = 'en') {
    const keys = key.split('.');
    let value = translations[lang] || translations['en'];
    
    for (const k of keys) {
        if (value && typeof value === 'object' && k in value) {
            value = value[k];
        } else {
            // 如果找不到，尝试使用英文
            value = translations['en'];
            for (const k2 of keys) {
                if (value && typeof value === 'object' && k2 in value) {
                    value = value[k2];
                } else {
                    return key; // 如果都找不到，返回key本身
                }
            }
            break;
        }
    }
    
    return typeof value === 'string' ? value : key;
}

// 中间件：处理语言设置
function i18nMiddleware(req, res, next) {
    // 强制使用英文（en）
    let lang = 'en';
    
    // 设置当前语言到 locals
    res.locals.lang = lang;
    res.locals.t = (key) => t(key, lang);
    
    // 将 t 函数挂载到 res 上，方便在路由中使用
    res.t = (key) => t(key, lang);
    
    next();
}

// 设置语言的中间件
function setLang(req, res) {
    const lang = req.body?.lang || req.query?.lang || 'en';
    
    // 验证语言
    if (translations[lang]) {
        // 设置cookie（简单实现）
        const cookieValue = `lang=${lang}; Path=/; Max-Age=${365 * 24 * 60 * 60}`;
        res.setHeader('Set-Cookie', cookieValue);
        return lang;
    }
    
    return 'en';
}

module.exports = {
    t,
    i18nMiddleware,
    setLang,
    loadTranslations
};

