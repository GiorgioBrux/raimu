import { routerLogger as logger } from '../utils/logger.js';
import { ErrorBoundary } from '../utils/ErrorBoundary.js';
import { RouteManager } from './RouteManager.js';
import { ComponentLoader } from './ComponentLoader.js';
import { Renderer } from './Renderer.js';
/**
 * Main router class that handles navigation and component rendering
 * @class
 */
export class Router {
    /**
     * Creates a new Router instance to handle client-side routing and navigation.
     * 
     * @param {import('./types').RouterConfig} config
     */
    constructor({ routes = [], basePath = '/src/', errorHandler = null, enableCache = true } = {}) {
        logger.debug('Created router');
        this.routeManager = new RouteManager();
        this.componentLoader = new ComponentLoader(basePath, enableCache);
        this.renderer = new Renderer();
        
        /** @type {string|null} Current route path */
        this.currentPath = null;

        /** @type {string|null} Previous route path */
        this.previousPath = null;

        /** @type {any} Current navigation state */
        this.currentState = null;

        /** @type {boolean} Whether a navigation is in progress */
        this.loading = false;

        /** @type {import('./types').BeforeNavigationHook[]} */
        this.beforeHooks = [];
        
        /** @type {import('./types').AfterNavigationHook[]} */
        this.afterHooks = [];

        // Wrap navigation methods with error boundary
        this.navigate = ErrorBoundary.wrap(
            this.navigate.bind(this),
            errorHandler || this._defaultErrorHandler,
            logger
        );

        this._initializeRouter(routes);

        logger.info({ 
            routeCount: routes.length,
            basePath,
            enableCache 
        }, 'Router initialized, path handled.');
    }

    /**
     * Initialize router and handle initial route
     */
    async init() {
        logger.debug('Initializing router');
        
        // Prefetch cached routes
        await this.componentLoader.prefetchComponents(
            this.routeManager.getRoutes()
        );
    }

    /**
     * Adds a global before navigation guard
     * @param {import('./types').BeforeNavigationHook} hook
     */
    beforeEach(hook) {
        this.beforeHooks.push(hook);
    }

    /**
     * Adds a global after navigation hook
     * @param {import('./types').AfterNavigationHook} hook
     */
    afterEach(hook) {
        this.afterHooks.push(hook);
    }

    /**
     * Navigate to a new route
     * @param {string} path - Target path
     * @param {import('./types').NavigationOptions} options - Navigation options
     */
    async navigate(path, { replace = false, state = null, silent = false } = {}) {
        logger.debug({ path, replace, state, silent }, 'Navigating to path');
        // Prevent navigating to the same path
        if (path === this.currentPath) {
            logger.debug({ path }, 'Skipping navigation to current path');
            return;
        }

        if (this.loading) {
            logger.warn('Navigation already in progress');
            return;
        }

        try {
            this.loading = true;

            const to = { 
                path, 
                params: this._getRouteParams(path),
                state 
            };

            const from = { 
                path: this.currentPath, 
                params: this._getRouteParams(this.currentPath),
                state: this.currentState 
            };

            // Run beforeEach hooks
            for (const hook of this.beforeHooks) {
                if (!(await hook(to, from))) {
                    logger.info({ from: from.path, to: to.path }, 'Navigation cancelled by beforeEach hook');
                    return;
                }
            }

            // Run route-specific beforeLeave guard
            const currentRoute = this._getCurrentRoute();
            if (currentRoute?.guards?.beforeLeave) {
                if (!(await currentRoute.guards.beforeLeave(from.params))) {
                    logger.info('Navigation cancelled by beforeLeave guard');
                    return;
                }
            }

            if (!silent) {
                
                if (replace) {
                    window.history.replaceState(state, '', path);
                } else {
                    window.history.pushState(state, '', path);
                }
            }

            await this._loadAndRenderRoute(path, to);

            // Update state
            this.previousPath = this.currentPath;
            this.currentPath = path;
            this.currentState = state;

            logger.info({ 
                from: from.path, 
                to: to.path,
                replace,
                silent
            }, 'Navigation completed');

        } catch (error) {
            logger.error({ error, path }, 'Navigation failed');
            throw error;
        } finally {
            this.loading = false;
        }
    }

    /**
     * Initializes the router, handles initial route and popstate events
     * @private
     * @param {import('./types').Route[]} routes - Routes to initialize
     */
    _initializeRouter(routes) {
        // Initialize routes
        routes.forEach(route => this.routeManager.validateAndAddRoute(route));
        
        
        window.addEventListener('popstate', (event) => {
            logger.debug('Back/Forward navigation detected, forcing refresh');
            window.location.reload();
            return;
        });

        // Handle initial route
        const initialPath = window.location.pathname;
        logger.debug({ path: initialPath }, 'Handling initial route');
        this.navigate(initialPath, { replace: true }).catch(this._defaultErrorHandler);
    }

    /**
     * @private
     * @param {string} path - Route path
     * @param {import('./types').RouteContext} context - Route context
     */
    async _loadAndRenderRoute(path, context) {
        const match = this.routeManager.matchRoute(path);
        if (!match) {
            logger.warn({ path }, 'No matching route found');
            return this.navigate('/', { replace: true });
        }

        const [route, params] = match;

        // Run route-specific beforeEnter guard
        if (route.guards?.beforeEnter) {
            if (!(await route.guards.beforeEnter(params))) {
                logger.info('Navigation cancelled by beforeEnter guard');
                return;
            }
        }

        // Load and process content
        const content = await this.componentLoader.fetchComponent(
            route.component, 
            route.cache
        );

        const processedContent = await this.componentLoader.processContent(
            content,
            route.components
        );

        // Render content
        await this.renderer.render(processedContent, route);

        // Run afterEnter hook
        if (route.guards?.afterEnter) {
            route.guards.afterEnter(params);
        }

        // Run afterEach hooks
        for (const hook of this.afterHooks) {
            await hook(context);
        }
    }

    /**
     * Gets the current active route configuration
     * @private
     * @returns {import('./types').Route | null} The current route configuration or null if no route is active
     */
    _getCurrentRoute() {
        if (!this.currentPath) return null;
        const match = this.routeManager.matchRoute(this.currentPath);
        return match ? match[0] : null;
    }

    /**
     * Gets route parameters for a given path
     * @private
     * @param {string} path - Route path to get parameters for
     * @returns {import('./types').RouteParams} Route parameters object
     */
    _getRouteParams(path) {
        if (!path) return {};
        const match = this.routeManager.matchRoute(path);
        return match ? match[1] : {};
    }

    /**
     * Default error handler for router errors
     * @private
     * @param {Error} error - Error that occurred during routing
     * @returns {void}
     */
    _defaultErrorHandler(error) {
        logger.error({ error }, 'Unhandled router error');
    }
}

// Export configured router instance
export const router = new Router({
    routes: [
        {
            path: '/',
            component: 'pages/home.html',
            components: {
                'createRoomVoiceSample': {
                    path: 'components/voiceSampler/index.html',
                    target: '#createRoomVoiceSample'
                }
            },
            cache: true,
            metadata: {
                title: 'Home'
            }
        },
        {
            path: '/room/:id',
            component: 'pages/room.html',
            components: {
                'mediaControls': 'components/mediaControls.html',
                'roomMediaSettings': {
                    path: 'components/mediaSettings/index.html',
                    target: '#roomMediaSettings'
                }
            },
            metadata: {
                title: 'Room',
                requiresAuth: true
            },
            transition: 'fade',
        },
        {
            path: '/join',
            component: 'pages/join.html',
            components: {
                'mediaSettings': {
                    path: 'components/mediaSettings/index.html',
                    target: '#mediaSettings'
                },
                'joinRoomVoiceSample': {
                    path: 'components/voiceSampler/index.html',
                    target: '#joinRoomVoiceSample'
                }
            },
            transition: 'fade',
            metadata: {
                title: 'Join Room'
            }
        }
    ]
}); 