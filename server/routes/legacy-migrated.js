const { translateProduct } = require('../../translate');
const { notifyForumNewPost, notifyForumNewReply, notifyOrderPaid } = require('../../telegram');
const { verifyOrderPaymentTx, messageForVerifyFailure } = require('../../usdt-tx-verify');
const { resolveCheckoutConfig } = require('../lib/productConfig');
const { registerLegacyAuthRoutes } = require('./legacy/auth-routes');
const { registerLegacyProductRoutes } = require('./legacy/product-routes');
const { registerLegacyCartRoutes } = require('./legacy/cart-routes');
const { registerLegacyAdminUserRoutes } = require('./legacy/admin-user-routes');
const { registerLegacyForumRoutes } = require('./legacy/forum-routes');
const { registerLegacyOrderRoutes } = require('./legacy/order-routes');
const { registerLegacyQuestionRoutes } = require('./legacy/questions-routes');
const { registerLegacyPopupNoticeRoutes } = require('./legacy/popup-notice-routes');

function registerLegacyMigratedRoutes(app, deps) {
  const {
    logger,
    dbOperations,
    loginLimiter,
    requireUser,
    requireAdmin,
    canAccessLegacyAdminApiAsync,
    tryPersistAdminSession,
    resolveAdminRequestContext,
    toAdminSessionUser,
    questionFilesUpload,
    questionChunkUpload,
    questionChunksPath,
    questionUploadsPath,
    questionChunkSessions,
    questionCompletedUploads,
    buildQuestionStoredName,
    cleanupQuestionChunkSession,
    consumeCompletedQuestionUpload,
    mergeChunkFiles,
    normalizeUploadFileName,
    getPaymentSettings,
    clearPaymentSettingsCache,
    normalizeProductRecord,
    productImageUpload,
    productUploadsPath,
    getUsdtWalletAddress,
    serializeProductDetailJson,
    parseProductCategoryId,
    parseProductSubCategoryId,
    parseCategoryParentId,
    rootDir,
  } = deps;

  registerLegacyAuthRoutes(app, {
    dbOperations,
    loginLimiter,
    canAccessLegacyAdminApiAsync,
    tryPersistAdminSession,
    resolveAdminRequestContext,
    toAdminSessionUser,
  });

  registerLegacyProductRoutes(app, {
    dbOperations,
    requireAdmin,
    normalizeProductRecord,
    productImageUpload,
    productUploadsPath,
    serializeProductDetailJson,
    parseProductCategoryId,
    parseProductSubCategoryId,
    parseCategoryParentId,
  });

  registerLegacyOrderRoutes(app, {
    dbOperations,
    requireUser,
    requireAdmin,
    getPaymentSettings,
    clearPaymentSettingsCache,
    getUsdtWalletAddress,
    verifyOrderPaymentTx,
    messageForVerifyFailure,
    notifyOrderPaid,
    translateProduct,
    resolveCheckoutConfig,
  });

  registerLegacyForumRoutes(app, {
    dbOperations,
    requireUser,
    requireAdmin,
    notifyForumNewPost,
    notifyForumNewReply,
  });

  registerLegacyCartRoutes(app, {
    dbOperations,
    requireUser,
    normalizeProductRecord,
  });

  registerLegacyAdminUserRoutes(app, { dbOperations, requireAdmin });

  registerLegacyQuestionRoutes(app, {
    logger,
    dbOperations,
    requireAdmin,
    questionFilesUpload,
    questionChunkUpload,
    questionChunksPath,
    questionUploadsPath,
    questionChunkSessions,
    questionCompletedUploads,
    buildQuestionStoredName,
    cleanupQuestionChunkSession,
    consumeCompletedQuestionUpload,
    mergeChunkFiles,
    normalizeUploadFileName,
    rootDir,
  });

  registerLegacyPopupNoticeRoutes(app, {
    dbOperations,
    requireAdmin,
});

}

module.exports = { registerLegacyMigratedRoutes };
