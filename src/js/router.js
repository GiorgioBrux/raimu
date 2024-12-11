/**
 * Simple client-side router for handling page navigation.
 */
class Router {
  /**
   * Creates a new Router instance with predefined routes.
   */
  constructor() {
    // All routes point to files in src/pages
    this.routes = {
      '/': '/src/pages/home.html',        // Root path shows home.html
      '/home': '/src/pages/home.html',    // Explicit home path
      '/room/:id': '/src/pages/room.html',
      '/join': '/src/pages/join.html'
    };

    // Define components that need to be loaded for specific routes
    this.components = {
      '/join': {
        'mediaSettings': '/src/components/mediaSettings/index.html'
      }
    };

    // Base path for all routes
    this.basePath = '/src/pages/';

    // Add cleanup handlers for specific routes
    this.cleanupHandlers = {
      '/join': () => {
        const mediaSettings = window.currentMediaSettings;
        if (mediaSettings) {
          mediaSettings.destroy();
          window.currentMediaSettings = null;
        }
      }
    };
  }

  /**
   * Loads a component and returns its HTML content
   * @param {string} path - Path to the component
   * @returns {Promise<string>} Component HTML
   */
  async loadComponent(path) {
    try {
      const response = await fetch(path);
      const html = await response.text();
      return html;
    } catch (error) {
      console.error('Error loading component:', error);
      return '';
    }
  }

  /**
   * Injects components into their placeholders in the page
   * @param {HTMLElement} content - The page content
   * @param {string} path - Current route path
   */
  async injectComponents(content, path) {
    const routeComponents = this.components[path];
    if (!routeComponents) return;

    for (const [id, componentPath] of Object.entries(routeComponents)) {
      const container = content.querySelector(`#${id}`);
      if (container) {
        const componentHtml = await this.loadComponent(componentPath);
        container.innerHTML = componentHtml;
      }
    }
  }

  /**
   * Initializes the router and sets up popstate event listener.
   * @returns {Promise<void>}
   */
  async init() {
    window.addEventListener('popstate', () => this.handleRoute());
    await this.handleRoute();
  }

  /**
   * Handles the current route and loads the appropriate page.
   * @returns {Promise<void>}
   */
  async handleRoute() {
    const oldPath = this.currentPath;
    const newPath = window.location.pathname;

    // Run cleanup for old route if exists
    if (oldPath && this.cleanupHandlers[oldPath]) {
      this.cleanupHandlers[oldPath]();
    }

    this.currentPath = newPath;
    
    let route = this.routes[newPath];

    // Handle dynamic routes
    if (!route && newPath.startsWith('/room/')) {
      route = this.routes['/room/:id'];
    }

    // Always fallback to home
    route = route || this.routes['/'];

    try {
      const response = await fetch(route);
      let html = await response.text();
      
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const content = doc.body.firstElementChild;
      
      if (content) {
        // Inject components before adding to DOM
        await this.injectComponents(content, newPath);
        
        const appContainer = document.getElementById('app');
        appContainer.innerHTML = '';
        appContainer.appendChild(content);
        
        await new Promise(resolve => setTimeout(resolve, 100));
        await this.onRouteChange?.(newPath);
      } else {
        console.error('No content found in the HTML');
      }
    } catch (error) {
      console.error('Error loading page:', error);
    }
  }

  /**
   * Navigates to a new route.
   * @param {string} path - The path to navigate to
   * @returns {Promise<void>}
   */
  navigate(path) {
    sessionStorage.setItem('lastPath', path);
    window.history.pushState({}, '', path);
    return this.handleRoute();
  }
}

export const router = new Router(); 