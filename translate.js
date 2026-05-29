// 简单的翻译工具 - 检测中文并返回英文占位符
// 这是一个简单的实现，实际项目中可以使用翻译API

// 检测字符串是否包含中文字符
function containsChinese(str) {
    if (!str || typeof str !== 'string') return false;
    return /[\u4e00-\u9fa5]/.test(str);
}

// 简单的翻译映射（可以根据需要扩展）
const translationMap = {
    // 产品名称映射示例
    '智能AI助手': 'Smart AI Assistant',
    '云端协作平台': 'Cloud Collaboration Platform',
    '数据分析系统': 'Data Analysis System',
    
    // 产品描述映射示例
    '基于大语言模型的智能助手，提供24/7服务': 'Intelligent assistant based on large language models, providing 24/7 service',
    '高效的团队协作工具，支持实时同步': 'Efficient team collaboration tool with real-time synchronization',
    '强大的数据分析和可视化平台': 'Powerful data analysis and visualization platform'
};

// 翻译函数
function translateToEnglish(text) {
    if (!text || typeof text !== 'string') {
        return text || '';
    }
    
    // 如果不包含中文，直接返回
    if (!containsChinese(text)) {
        return text;
    }
    
    // 检查是否有直接映射
    if (translationMap[text]) {
        return translationMap[text];
    }
    
    // 无映射时保持原文，不添加任何前缀（否则功能卡/规格卡标题会出现 […] 占位文案）
    return text;
}

/** 解析并翻译详情页功能卡（后台 JSON） */
function translateFeatureCards(product) {
    let raw = [];
    if (product.featureCards && Array.isArray(product.featureCards)) {
        raw = product.featureCards;
    } else if (product.featuresJson && typeof product.featuresJson === 'string') {
        try {
            const v = JSON.parse(product.featuresJson);
            if (Array.isArray(v)) raw = v;
        } catch (_e) {}
    }
    return raw.slice(0, 12).map((c) => {
        const title = String(c.title || '').trim();
        const description = String(c.description || '').trim();
        const icon = typeof c.icon === 'string' && c.icon.trim() ? c.icon.trim() : 'fa-star';
        return {
            title: title ? translateToEnglish(title) : '',
            description: description ? translateToEnglish(description) : '',
            icon
        };
    }).filter((c) => c.title || c.description);
}

/** 解析并翻译详情页技术规格卡（后台 specsJson） */
function translateSpecCards(product) {
    let raw = [];
    if (product.specCards && Array.isArray(product.specCards)) {
        raw = product.specCards;
    } else if (product.specsJson && typeof product.specsJson === 'string') {
        try {
            const v = JSON.parse(product.specsJson);
            if (Array.isArray(v)) raw = v;
        } catch (_e) {}
    }
    return raw.slice(0, 12).map((c) => {
        const title = String(c.title || '').trim();
        const description = String(c.description || '').trim();
        const icon = typeof c.icon === 'string' && c.icon.trim() ? c.icon.trim() : 'fa-star';
        return {
            title: title ? translateToEnglish(title) : '',
            description: description ? translateToEnglish(description) : '',
            icon
        };
    }).filter((c) => c.title || c.description);
}

/** 解析并翻译详情页「重要说明」行（usageNoticeJson） */
function translateUsageNoticeLines(product) {
    let raw = [];
    if (product.usageNoticeLines && Array.isArray(product.usageNoticeLines)) {
        raw = product.usageNoticeLines;
    } else if (product.usageNoticeJson && typeof product.usageNoticeJson === 'string') {
        try {
            const v = JSON.parse(product.usageNoticeJson);
            if (Array.isArray(v)) raw = v;
        } catch (_e) {}
    }
    const out = [];
    for (const item of raw.slice(0, 20)) {
        if (!item || typeof item !== 'object') continue;
        const text = String(item.text ?? '').trim();
        if (!text) continue;
        const modeRaw = String(item.mode ?? 'check').toLowerCase();
        const mode = modeRaw === 'ban' || modeRaw === 'warn' ? 'ban' : 'check';
        out.push({ text: translateToEnglish(text), mode });
    }
    return out;
}

// 翻译产品对象
function translateProduct(product) {
    if (!product) return product;
    
    const translated = { ...product };
    
    // 翻译产品名称
    if (product.name) {
        translated.name = translateToEnglish(product.name);
    }
    
    // 翻译产品描述
    if (product.description) {
        translated.description = translateToEnglish(product.description);
    }

    translated.featureCards = translateFeatureCards(product);
    translated.specCards = translateSpecCards(product);
    translated.usageNoticeLines = translateUsageNoticeLines(product);

    if (product.categoryNameEn) {
        translated.categoryName = product.categoryNameEn;
    } else if (product.categoryName) {
        translated.categoryName = translateToEnglish(product.categoryName);
    }

    if (product.subCategoryNameEn) {
        translated.subCategoryName = product.subCategoryNameEn;
    } else if (product.subCategoryName) {
        translated.subCategoryName = translateToEnglish(product.subCategoryName);
    }

    return translated;
}

// 翻译产品数组
function translateProducts(products) {
    if (!Array.isArray(products)) {
        return products;
    }
    
    return products.map(product => translateProduct(product));
}

module.exports = {
    translateToEnglish,
    translateProduct,
    translateProducts,
    translateUsageNoticeLines,
    containsChinese,
    translationMap
};










