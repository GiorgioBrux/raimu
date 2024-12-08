/**
 * Manages expandable/collapsible panels in the room interface.
 */
export class PanelManager {
  /**
   * Toggles the expanded/collapsed state of a panel.
   * @param {string} elementId - ID of the element within the panel to toggle
   */
  static togglePanel(elementId) {
    const panel = document.getElementById(elementId)?.parentElement;
    if (!panel) return;

    const isExpanded = panel.classList.contains('panel-expanded');
    
    panel.classList.remove('panel-expanded', 'panel-collapsed');
    void panel.offsetWidth; // Force reflow
    panel.classList.add(isExpanded ? 'panel-collapsed' : 'panel-expanded');
  }

  /**
   * Toggles the visibility of an element.
   * @param {HTMLElement} element - Element to toggle visibility
   * @param {boolean} show - Whether to show the element
   */
  static toggleVisibility(element, show) {
    if (!element) return;

    element.classList.remove('hidden-content', 'visible-content');
    void element.offsetWidth; // Force reflow
    element.classList.add(show ? 'visible-content' : 'hidden-content');
  }
} 