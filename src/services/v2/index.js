/**
 * Laravel /api/v2 服务层统一导出
 *
 * 约定：
 * - 前台业务：auth / cart / orders / forum / catalog / payment / popup
 * - 后台业务：admin/*
 * - 仍走 Node 的聊天、设备公开验签：继续使用 @/services/api 直连 /api/chat、/api/device
 */
export { default as v2 } from './http'
export * as userAuth from './auth'
export * as cart from './cart'
export * as orders from './orders'
export * as forum from './forum'
export * as catalog from './catalog'
export * as payment from './payment'
export * as popup from './popup'

export * as adminAuth from './admin/auth'
export * as adminDashboard from './admin/dashboard'
export * as adminUsers from './admin/users'
export * as adminRoles from './admin/roles'
export * as adminAgents from './admin/agents'
export * as adminOrders from './admin/orders'
export * as adminForum from './admin/forum'
export * as adminQuestions from './admin/questions'
export * as adminFirmware from './admin/firmware'
export * as adminDevices from './admin/devices'
export * as adminChatSettings from './admin/chatSettings'
export * as adminPopupNotices from './admin/popupNotices'
export * as adminPaymentSettings from './admin/paymentSettings'
