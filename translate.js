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
    
    // 如果没有映射，返回英文占位符
    // 可以根据需要扩展，比如使用翻译API
    return '[English Translation] ' + text;
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
    containsChinese,
    translationMap
};










