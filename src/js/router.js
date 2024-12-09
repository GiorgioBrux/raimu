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

    // Base path for all routes
    this.basePath = '/src/pages/';
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
    const path = window.location.pathname;
    let route = this.routes[path];

    // Handle dynamic routes
    if (!route && path.startsWith('/room/')) {
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
      
      const appContainer = document.getElementById('app');
      appContainer.innerHTML = '';
      
      if (content) {
        appContainer.appendChild(content);
        await new Promise(resolve => setTimeout(resolve, 100));
        await this.onRouteChange?.(path);
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
    window.history.pushState({}, '', path);
    return this.handleRoute();
  }
}

export const router = new Router(); 