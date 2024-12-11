import { routerLogger as logger } from '../utils/logger.js';

/**
 * Manages route registration, matching and cleanup
 * @class
 * @classdesc Manages route registration, matching and cleanup handlers for the router
 */
export class RouteManager {
    /**
     * Creates a new RouteManager instance
     * @constructor
     * @description Manages route registration, matching and cleanup handlers for the router
     * @property {Map<string, Route>} routes - Map of registered routes keyed by path
     * @property {Map<string, Function>} cleanupHandlers - Map of cleanup handlers keyed by path
     */
    constructor() {
        /** @type {Map<string, Route>} - Stores registered routes with path as key */
        this.routes = new Map();
        /** @type {Map<string, Function>} - Stores cleanup handlers with path as key */
        this.cleanupHandlers = new Map();
    }

    /**
     * Registers a cleanup handler for a route
     * @param {string} path - Route path
     * @param {Function} handler - Cleanup handler
     */
    registerCleanupHandler(path, handler) {
        this.cleanupHandlers.set(path, handler);
        logger.debug({ path }, 'Cleanup handler registered');
    }

    /**
     * Runs cleanup for a given path
     * @param {string} path - Route path
     */
    async runCleanup(path) {
        const handler = this.cleanupHandlers.get(path);
        if (handler) {
            try {
                await handler();
                logger.debug({ path }, 'Cleanup completed');
            } catch (error) {
                logger.error({ error, path }, 'Cleanup failed');
                throw error;
            }
        }
    }

    /**
     * Gets all registered routes
     * @returns {Route[]}
     */
    getRoutes() {
        return Array.from(this.routes.values());
    }

    /**
     * Validates and registers a new route
     * @param {Route} route - Route configuration
     * @throws {Error} If route configuration is invalid
     */
    validateAndAddRoute(route) {
        if (!route?.path || !route?.component) {
            logger.error({ route }, 'Invalid route configuration');
            throw new Error('Route requires path and component');
        }

        const pattern = this._createRoutePattern(route.path);
        this.routes.set(route.path, { ...route, pattern });
        logger.debug({ path: route.path }, 'Route registered');
    }

    /**
     * Creates a regex pattern for route matching
     * @private
     * @param {string} path - Route path pattern
     * @returns {RegExp} Compiled route pattern
     */
    _createRoutePattern(path) {
        return new RegExp(
            '^' + path.replace(/:\w+/g, '([^/]+)') + '$'
        );
    }

    /**
     * @param {string} path
     * @returns {[Route, RouteParams] | null}
     * @throws {Error} If path is invalid
     */
    matchRoute(path) {
        if (!path) {
            logger.error('Invalid path provided to matchRoute');
            throw new Error('Path is required');
        }

        for (const [, route] of this.routes) {
            const matches = path.match(route.pattern);
            if (matches) {
                const params = this._extractParams(route, matches);
                logger.debug({ path, params }, 'Route matched');
                return [route, params];
            }
        }

        logger.debug({ path }, 'No matching route found');
        return null;
    }

    /**
     * Extracts parameters from route matches
     * @private
     * @param {Route} route - Route configuration
     * @param {RegExpMatchArray} matches - Regex matches
     * @returns {RouteParams} Extracted parameters
     */
    _extractParams(route, matches) {
        const params = {};
        const paramNames = (route.path.match(/:\w+/g) || [])
            .map(param => param.slice(1));

        // Add query parameters if present
        const queryParams = new URLSearchParams(window.location.search);
        const query = {};
        for (const [key, value] of queryParams) {
            query[key] = value;
        }

        // Add hash if present
        const hash = window.location.hash.slice(1);

        paramNames.forEach((name, i) => {
            params[name] = matches[i + 1];
        });

        return {
            ...params,
            query: Object.keys(query).length > 0 ? query : undefined,
            hash: hash || undefined
        };
    }
} 