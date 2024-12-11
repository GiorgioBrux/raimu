import { routerLogger as logger } from '../utils/logger.js';

/**
 * Handles DOM rendering and page transitions for the router
 * @class
 * @classdesc Manages rendering content into the app container and handles animated transitions between routes
 */
export class Renderer {
    /**
     * Creates a new Renderer instance
     * @constructor
     * @throws {Error} When the required #app container element is not found in the DOM
     */
    constructor() {
        /** @type {HTMLElement} The main application container element */
        this.container = document.getElementById('app');
        
        if (!this.container) {
            logger.error('Required app container element not found');
            throw new Error('App container not found');
        }
    }

    /**
     * Handles route transitions
     * @private
     * @param {string} transitionName - Transition class name
     * @returns {Promise<string>} Previous content
     */
    async _handleTransition(transitionName) {
        if (!transitionName) return;

        const oldContent = this.container.innerHTML;
        const scrollPos = window.scrollY;

        // Setup initial state
        this.container.classList.add('transition-all', 'duration-100', 'ease-in-out');
        
        // Start exit transition
        this.container.classList.add(`${transitionName}-leave`);
        // Force browser reflow
        this.container.offsetHeight; 
        this.container.classList.add(`${transitionName}-leave-active`);
        
        // Wait for exit transition to complete
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Clear content and reset scroll
        this.container.innerHTML = '';
        if (scrollPos > 0) {
            window.scrollTo(0, scrollPos);
        }

        // Reset classes for enter transition
        this.container.classList.remove(
            `${transitionName}-leave`,
            `${transitionName}-leave-active`
        );

        // Setup enter transition
        this.container.classList.add(`${transitionName}-enter`);
        // Force browser reflow
        this.container.offsetHeight;
        this.container.classList.add(`${transitionName}-enter-active`);

        // Wait for enter transition
        await new Promise(resolve => {
            const onTransitionEnd = () => {
                this.container.classList.remove(
                    'transition-all',
                    'duration-100',
                    'ease-in-out',
                    `${transitionName}-enter`,
                    `${transitionName}-enter-active`
                );
                this.container.removeEventListener('transitionend', onTransitionEnd);
                resolve();
            };
            this.container.addEventListener('transitionend', onTransitionEnd);
        });

        return oldContent;
    }

    /**
     * Renders content to the DOM with transition support
     * @param {string} content - HTML content to render
     * @param {import('./types').Route} route - Current route
     * @returns {Promise<void>}
     * @throws {Error} If rendering fails
     */
    async render(content, route) {
        if (!content) {
            logger.error('Invalid content provided to render');
            throw new Error('Content is required');
        }

        try {
            // Handle transitions
            if (route.transition) {
                await this._handleTransition(route.transition);
            }

            // Update DOM
            this.container.innerHTML = content;

            // Handle metadata
            this._updateMetadata(route);
            await this._loadAdditionalResources(route);

            logger.debug({
                hasTransition: !!route.transition,
                title: route.metadata?.title,
                path: route.path
            }, 'Content rendered successfully');

        } catch (error) {
            logger.error({ error }, 'Render failed');
            throw error;
        }
    }

    /**
     * Updates page metadata based on route configuration
     * @private
     * @param {Route} route - Current route
     */
    _updateMetadata(route) {
        if (route.metadata?.title) {
            document.title = route.metadata.title;
        }

        if (route.metadata?.description) {
            const metaDesc = document.querySelector('meta[name="description"]');
            if (metaDesc) {
                metaDesc.setAttribute('content', route.metadata.description);
            }
        }
    }

    /**
     * Loads additional scripts and styles
     * @private
     * @param {Route} route - Current route
     * @returns {Promise<void>}
     */
    async _loadAdditionalResources(route) {
        const { scripts = [], styles = [] } = route.metadata || {};

        // Load styles
        styles.forEach(href => {
            logger.debug({ href }, 'Loading style');
            if (!document.querySelector(`link[href="${href}"]`)) {
                const link = document.createElement('link');
                link.rel = 'stylesheet';
                link.href = href;
                document.head.appendChild(link);
            }
        });

        // Load scripts
        const scriptPromises = scripts.map(src => {
            if (!document.querySelector(`script[src="${src}"]`)) {
                logger.debug({ src }, 'Loading script');
                return new Promise((resolve, reject) => {
                    const script = document.createElement('script');
                    script.src = src;
                    script.onload = resolve;
                    script.onerror = reject;
                    document.head.appendChild(script);
                });
            }
            return Promise.resolve();
        });

        await Promise.all(scriptPromises);
    }
} 