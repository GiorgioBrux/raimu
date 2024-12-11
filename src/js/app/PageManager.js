import { HomeHandler } from './handlers/HomeHandler.js';
import { JoinHandler } from './handlers/JoinHandler.js';
import { RoomHandler } from './handlers/RoomHandler.js';
import { appLogger as logger } from '../utils/logger.js';
import { AppTypes } from './types.js';

/** @typedef {AppTypes['PageHandler']} PageHandler */

/**
 * @class
 * @classdesc Manages page navigation and handler initialization
 */
export class PageManager {
    /**
     * @param {ServiceManager} serviceManager
     */
    constructor(serviceManager) {
        this.serviceManager = serviceManager;
        this.currentHandler = null;
        
        /** @type {Map<string, new (serviceManager: ServiceManager) => PageHandler>} */
        this.handlers = new Map([
            ['/', HomeHandler],
            ['/join', JoinHandler],
            ['/room', RoomHandler]
        ]);
    }

    /**
     * Initializes a page based on route
     * @param {RouteContext} context - Route context
     */
    async handlePage(context) {
        try {
            // Skip if same handler and path
            if (this.currentHandler && 
                this.currentHandler.constructor === this.getHandlerForPath(context.path)) {
                logger.debug('Skipping handler initialization for same path');
                return;
            }

            // Cleanup previous handler before initializing new one
            if (this.currentHandler?.cleanup) {
                await this.currentHandler.cleanup();
            }

            // Find and initialize new handler
            const HandlerClass = this.getHandlerForPath(context.path);
            if (HandlerClass) {
                this.currentHandler = new HandlerClass(this.serviceManager);
                
                if (context.path.startsWith('/room/')) {
                    await this.currentHandler.initialize(context.params.id);
                } else {
                    await this.currentHandler.initialize();
                }
            }
        } catch (error) {
            logger.error({ error, path: context.path }, 'Failed to handle page');
            throw error;
        }
    }

    /**
     * Gets the appropriate handler for a path
     * @private
     */
    getHandlerForPath(path) {
        for (const [routePath, handler] of this.handlers) {
            // Exact match for root path
            if (routePath === '/' && path === '/') {
                logger.debug({ routePath, path }, 'Found handler for root path');
                return handler;
            }
            // Path starts with route path for other routes
            else if (routePath !== '/' && path.startsWith(routePath)) {
                logger.debug({ routePath, path }, 'Found handler for path');
                return handler;
            }
            else {
                logger.debug({routePath, path}, 'Handler not matching path');
            }
        }
        logger.debug({ path }, 'No handler found for path');
        return null;
    }
} 