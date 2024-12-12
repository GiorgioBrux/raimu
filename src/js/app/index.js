import { router } from '../router/index.js';
import { ServiceManager } from './ServiceManager.js';
import { PageManager } from './PageManager.js';
import { appLogger as logger } from '../utils/logger.js';

/**
 * Main application class that orchestrates routing and services
 * @class
 * @classdesc Manages application initialization, service management and global error handling
 */
export class App {
    /**
     * @constructor
     */
    constructor() {
        logger.debug("Welcome to the app, running...");
        this.validateDOMElements();
        
        this.serviceManager = new ServiceManager();
        this.pageManager = new PageManager(this.serviceManager);

        this.initialize().catch(error => {
            logger.error({ error }, 'Failed to initialize app');
            this.handleError(error);
        });

        // Set up global error recovery
        window.addEventListener('online', () => {
            logger.info('Network connection restored');
            this.serviceManager.handleDisconnection();
        });

        window.addEventListener('offline', () => {
            logger.warn('Network connection lost');
            logger.error('Network connection lost. Waiting for connection...');
        });
    }

    /**
     * Validates required DOM elements exist
     * @private
     * @throws {Error} If required elements are missing
     */
    validateDOMElements() {
        if (!document.getElementById('app')) {
            logger.error('Required app container element not found');
            throw new Error('Missing required app container');
        } else {
            logger.debug('App container element found');
        }
    }

    /**
     * Initializes the application
     * @private
     */
    async initialize() {
        await this.initializeServices();
        this.setupRouter();
        this.setupWindowHandlers();
        
        // Make router available globally
        window.appRouter = router;

        logger.info('App initialized');
    }

    /**
     * Initializes core services
     * @private
     */
    async initializeServices() {
        try {
            await this.serviceManager.initialize();
        } catch (error) {
            logger.error({ error }, 'Failed to initialize services');
            throw error;
        }
    }

    /**
     * Sets up router configuration
     * @private
     */
    setupRouter() {
        // Handle page initialization after navigation
        router.afterEach(async (/** @type {import('../router/types.js').RouteContext} */ context) => {
            try {
                logger.debug({ context }, 'Handling page');
                await this.pageManager.handlePage(context);
            } catch (error) {
                logger.error({ error, path: context.path }, 'Failed to handle page');
                this.handleError(error);
            }
        });

        // Initialize router
        router.init().catch(error => {
            logger.error({ error }, 'Router initialization failed');
            this.handleError(error);
        });
    }

    /**
     * Sets up window event handlers
     * @private
     */
    setupWindowHandlers() {
        window.addEventListener('beforeunload', () => {
            this.handleBeforeUnload();
        });

        window.addEventListener('error', (event) => {
            logger.error({ 
                error: event.error,
                message: event.message,
                filename: event.filename,
                lineno: event.lineno
            }, 'Uncaught error');
        });

        window.addEventListener('unhandledrejection', (event) => {
            logger.error({ 
                reason: event.reason 
            }, 'Unhandled promise rejection');
        });
    }

    /**
     * Handles page unload event
     * @private
     */
    handleBeforeUnload() {
        logger.debug('Handling before unload, lastPath: ', sessionStorage.getItem('lastPath'));
        const currentPath = window.location.pathname;
        const lastPath = sessionStorage.getItem('lastPath');

        if (currentPath === lastPath) {
            sessionStorage.clear();
            logger.debug('Session storage cleared on refresh');
            sessionStorage.setItem('lastPath', currentPath);
        } else {
            sessionStorage.setItem('lastPath', currentPath);
        }

        this.serviceManager.cleanup().catch(error => {
            logger.error({ error }, 'Cleanup failed during unload');
        });
    }

    /**
     * Global error handler
     * @private
     */
    handleError(error) {
        logger.error({ error }, 'An unexpected error occurred');
    }
}

// Initialize app
const app = new App();
export default app; 