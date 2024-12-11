import { routerLogger as logger } from '../utils/logger.js';

/**
 * Handles component loading, caching and processing
 * @class
 * @classdesc Manages component loading, caching and processing for the router
 */
export class ComponentLoader {
    /**
     * Creates a new ComponentLoader instance
     * @param {string} basePath - Base directory path where components are located
     * @param {boolean} [enableCache=true] - Whether to cache loaded components in memory
     */
    constructor(basePath, enableCache = true) {
        /** @type {string} Base directory path for loading components */
        this.basePath = basePath;
        /** @type {Map<string, string>} Cache storing component paths to their HTML content */
        this.cache = new Map();
        /** @type {boolean} Whether component caching is enabled */
        this.enableCache = enableCache;
        /** @type {Set<string>} Set of component IDs that have been initialized */
        this.initializedComponents = new Set();
    }

    /**
     * Processes HTML content and injects child components
     * @param {string} content - Raw HTML content
     * @param {Object<string, string>} [components] - Child components mapping
     * @returns {Promise<string>} Processed HTML content
     * @throws {Error} If component loading fails
     */
    async processContent(content, childComponents = {}) {
        const container = document.createElement('div');
        container.innerHTML = content;

        // Process child components first
        for (const [id, config] of Object.entries(childComponents)) {
            // Handle both string paths and component configs
            const componentConfig = typeof config === 'string' 
                ? { path: config } 
                : config;

            const childContent = await this.fetchComponent(componentConfig.path);
            
            // Find target element
            const target = componentConfig.target 
                ? container.querySelector(componentConfig.target)
                : container.querySelector(`[data-component="${id}"]`);


            if (target) {
                logger.debug({
                    component: componentConfig.target
                }, 'Setting child content of');
                target.innerHTML = childContent;
            }
        }

        // Handle other scripts
        const scripts = Array.from(container.getElementsByTagName('script'));
        for (const script of scripts) {
            const newScript = document.createElement('script');
            
            Array.from(script.attributes).forEach(attr => {
                newScript.setAttribute(attr.name, attr.value);
            });

            if (script.type === 'module') {
                script.remove();
                continue;
            }

            if (script.src) {
                newScript.src = script.src;
            } else {
                newScript.textContent = script.textContent;
            }

            script.parentNode.replaceChild(newScript, script);
        }

        return container.innerHTML;
    }

    /**
     * Prefetches components for faster loading
     * @param {import('./types').Route[]} routes - Routes to prefetch
     * @returns {Promise<void>}
     */
    async prefetchComponents(routes) {
        const prefetchPromises = routes
            .filter(route => route.cache)
            .map(route => this.fetchComponent(route.component, true));

        try {
            await Promise.all(prefetchPromises);
            logger.info('Components prefetched successfully');
        } catch (error) {
            logger.error({ error }, 'Component prefetch failed');
        }
    }

    /**
     * Loads an external script
     * @private
     * @param {string} src - Script source URL
     */
    async _loadExternalScript(src) {
        try {
            const response = await fetch(src);
            const content = await response.text();
            const script = document.createElement('script');
            script.textContent = content;
            document.head.appendChild(script);
        } catch (error) {
            logger.error({ error, src }, 'Failed to load external script');
            throw error;
        }
    }

    /**
     * Fetches a component from the server
     * @param {string} path - Component path
     * @param {boolean} [useCache=false] - Whether to use cache
     * @returns {Promise<string>} Component content
     * @throws {Error} If fetch fails or response is invalid
     */
    async fetchComponent(path, useCache = false) {
        if (!path) {
            logger.error('Invalid path provided to fetchComponent');
            throw new Error('Component path is required');
        }

        if (useCache && this.cache.has(path)) {
            logger.debug({ path }, 'Returning cached component');
            return this.cache.get(path);
        }

        const fullPath = `${this.basePath}${path}`;
        logger.debug({ path: fullPath }, 'Fetching component');

        try {
            const response = await fetch(fullPath);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const content = await response.text();
            
            if (useCache && this.enableCache) {
                this.cache.set(path, content);
                logger.debug({ path }, 'Component cached');
            }
            
            return content;
        } catch (error) {
            logger.error({ error, path: fullPath }, 'Component fetch failed');
            throw error;
        }
    }

    /**
     * Loads child components into a document
     * @param {Document} doc - Parent document
     * @param {Object<string, string>} components - Component mapping
     * @returns {Promise<void>}
     * @throws {Error} If any component fails to load
     */
    async loadChildComponents(doc, components) {
        if (!doc || !components) {
            logger.error('Invalid parameters provided to loadChildComponents');
            throw new Error('Document and components are required');
        }

        const loadPromises = Object.entries(components).map(async ([id, path]) => {
            const container = doc.getElementById(id);
            if (!container) {
                logger.warn({ componentId: id }, 'Component container not found');
                return;
            }

            try {
                const componentContent = await this.fetchComponent(path);
                container.innerHTML = componentContent;
                logger.debug({ componentId: id }, 'Child component loaded');
            } catch (error) {
                logger.error({ error, componentId: id }, 'Failed to load child component');
                throw error;
            }
        });

        await Promise.all(loadPromises);
    }

    /**
     * Clears the component cache
     * @param {string} [path] - Path to clear cache for, if not provided, all cache is cleared
     * @returns {void}
     */
    clearCache(path = null) {
        if (path) {
            this.cache.delete(path);
            this.initializedComponents.clear();
        } else {
            this.cache.clear();
            this.initializedComponents.clear();
        }
        logger.debug({ path }, 'Cache cleared');
    }
} 