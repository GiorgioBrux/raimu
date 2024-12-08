/**
 * Simple client-side router for handling page navigation.
 */
class Router {
  /**
   * Creates a new Router instance with predefined routes.
   */
  constructor() {
    this.routes = {
      '/': '/src/pages/home.html',
      '/room/:id': '/src/pages/room.html',
      '/join': '/src/pages/join.html'
    };
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

    route = route || this.routes['/'];  // Fallback to home
    
    try {
      const response = await fetch(route);
      let html = await response.text();
      
      // Create a temporary container to parse the HTML
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      
      // Get the content from the parsed document
      const content = doc.body.firstElementChild;
      
      // Clear and update the app container
      const appContainer = document.getElementById('app');
      appContainer.innerHTML = '';
      if (content) {
        appContainer.appendChild(content);
        // Wait for next tick to ensure DOM is updated
        await new Promise(resolve => setTimeout(resolve, 100)); // Increased timeout
        // Call the route change callback
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