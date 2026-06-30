import {
  registerAdminUnauthorizedHandler,
  registerUserUnauthorizedHandler,
} from '@/services/sessionUnauthorizedRegistry'
import { handleAdminSessionUnauthorized } from '@/utils/adminSessionRedirect'
import { handleUserSessionUnauthorized } from '@/utils/userSessionRedirect'

registerAdminUnauthorizedHandler(handleAdminSessionUnauthorized)
registerUserUnauthorizedHandler(handleUserSessionUnauthorized)
