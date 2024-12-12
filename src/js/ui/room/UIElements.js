import { uiLogger as logger } from "../../utils/logger.js";

/**
 * Manages access to UI elements in the room interface.
 */
export class UIElements {
  /**
   * Creates a new UIElements instance.
   */
  constructor() {
    this.elements = {};
  }

  /**
   * Initializes UI elements with retry mechanism.
   * @param {number} [maxRetries=5] - Maximum number of initialization attempts
   * @param {number} [delay=200] - Delay between retries in milliseconds
   * @returns {Promise<boolean>} Whether initialization was successful
   */
  async initialize(maxRetries = 5, delay = 200) {
    for (let i = 0; i < maxRetries; i++) {
      if (await this.initializeElements()) {
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    return false;
  }

  /**
   * Attempts to initialize all required UI elements.
   * @returns {boolean} Whether all elements were found
   */
  initializeElements() {
    try {
      this.elements = {
        videoGrid: document.getElementById('videoGrid'),
        remoteTemplate: document.getElementById('videoTemplate'),
        roomName: document.getElementById('roomName'),
        PIN: document.getElementById('pinDisplay'),
        copyPinBtn: document.getElementById('copyPinBtn'),
        controls: this.initializeControls(),
        settingsModal: document.getElementById('settingsModal'),
        chatInput: document.getElementById('chatInput'),
        sendMessage: document.getElementById('sendMessage'),
        chatMessages: document.getElementById('chatMessages'),
      };

      return this.validateElements();
    } catch (error) {
      logger.error('Error initializing elements:', error);
      return false;
    }
  }

  /**
   * Initializes control button elements.
   * @returns {Object} Object containing control button elements
   */
  initializeControls() {
    return {
      audio: document.getElementById('toggleAudio'),
      video: document.getElementById('toggleVideo'),
      leave: document.getElementById('leaveCall'),
      transcribe: document.getElementById('toggleTranscription'),
      chat: document.getElementById('toggleChat'),
      settings: document.getElementById('settings')
    };
  }

  /**
   * Validates that all required elements were found.
   * @returns {boolean} Whether all elements are present
   */
  validateElements() {
    // Check main elements
    for (const [key, element] of Object.entries(this.elements)) {
      if (!element && key !== 'controls') {
        logger.error(`Missing required UI element: ${key}`);
        return false;
      }
    }

    // Check control elements 
    for (const [key, element] of Object.entries(this.elements.controls)) {
      if (!element) {
        logger.error(`Missing required control element: ${key}`);
        return false;
      }
    }

    return true;
  }

  /**
   * Gets all initialized UI elements.
   * @returns {Object} Object containing all UI elements
   */
  getElements() {
    return this.elements;
  }

  /**
   * Adds a local video element reference
   * @param {HTMLElement} container - The video container element to add
   */
  addLocalVideoElement(container){
    this.elements.localVideo = container;
  }
} 