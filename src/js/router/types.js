import { logger } from '../utils/logger.js';

/**
 * @typedef {Object} RouteParams
 * @property {string} [id] - Route parameter ID
 * @property {Record<string, string>} [query] - URL query parameters
 * @property {string} [hash] - URL hash fragment
 */

/**
 * @typedef {Object} RouteGuards
 * @property {(to: RouteContext) => Promise<boolean>} [beforeEnter] - Called before entering route
 * @property {(from: RouteContext) => Promise<boolean>} [beforeLeave] - Called before leaving route
 * @property {(context: RouteContext) => void} [afterEnter] - Called after entering route
 * @property {() => Promise<void>} [onDestroy] - Called when cleaning up route
 * @property {(error: Error) => void} [onError] - Called when route errors occur
 */

/**
 * @typedef {Object} RouteMetadata
 * @property {string} [title] - Page title
 * @property {boolean} [requiresAuth] - Whether route requires authentication
 * @property {string[]} [permissions] - Required permissions
 * @property {Record<string, any>} [data] - Additional route metadata
 * @property {string} [description] - Page meta description
 * @property {string[]} [scripts] - Additional scripts to load
 * @property {string[]} [styles] - Additional styles to load
 */

/**
 * @typedef {Object} Route
 * @property {string} path - Route path pattern
 * @property {string} component - Component file path
 * @property {Object<string, string>} [components] - Child components
 * @property {RouteGuards} [guards] - Route guards
 * @property {RouteMetadata} [metadata] - Route metadata
 * @property {string} [transition] - Transition animation name
 * @property {boolean} [cache=false] - Whether to cache component
 */

/**
 * @typedef {Object} RouteContext
 * @property {string} path - Current path
 * @property {RouteParams} params - Route parameters
 * @property {any} [state] - Navigation state
 */

/**
 * @typedef {Object} NavigationOptions
 * @property {boolean} [replace=false] - Replace current history entry
 * @property {any} [state] - Navigation state
 * @property {boolean} [silent=false] - Skip navigation events
 */

/**
 * @typedef {Object} RouterConfig
 * @property {Route[]} routes - Route definitions
 * @property {string} [basePath='/src/'] - Base path for components
 * @property {Function} [errorHandler] - Global error handler
 * @property {boolean} [enableCache=true] - Enable component caching
 */

/** 
 * Hook that runs before navigation
 * @typedef {Object} BeforeNavigationHook
 * @property {(to: RouteContext, from: RouteContext) => Promise<boolean>}
 */

/**
 * Hook that runs after navigation
 * @typedef {Object} AfterNavigationHook
 * @property {(to: RouteContext) => Promise<void>}
 */

export const RouteTypes = {
    /** @type {RouteParams} */
    RouteParams: null,
    /** @type {RouteGuards} */
    RouteGuards: null,
    /** @type {RouteMetadata} */
    RouteMetadata: null,
    /** @type {Route} */
    Route: null,
    /** @type {RouteContext} */
    RouteContext: null,
    /** @type {NavigationOptions} */
    NavigationOptions: null,
    /** @type {RouterConfig} */
    RouterConfig: null
}; 