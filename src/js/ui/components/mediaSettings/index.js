import { uiLogger as logger } from '../../../utils/logger.js';
import { AudioMeter } from './audioMeter.js';
import { DeviceManager } from './deviceManager.js';
import { StreamManager } from './streamManager.js';
import { AudioTest } from './audioTest.js'; 

export class MediaSettings {
  /**
   * @param {HTMLElement} container
   * @param {Object} [options]
   * @param {MediaStream} [options.initialStream] - Initial stream to use
   * @{(stream: MediaStream) => void} [options.onStreamUpdate] - Callback when stream changes
   */
  constructor(container, options = {}) {
    logger.info('Initializing MediaSettings with container: ', container);
    
    this.container = container;
    this.options = options;
    this.elements = this.cacheElements();

    // Show/hide close button based on option
    if (this.elements.closeButton) {
        logger.debug('Close button set to: ', options.showCloseButton);
        this.elements.closeButton.classList.toggle('hidden', !options.showCloseButton);
    }

    // Show/hide mic and camera controls based on option
    if (this.elements.micControl) {
      logger.debug('Mic control set to: ', options.showMicControl);
        this.elements.micControl.classList.toggle('hidden', !options.showMicControl);
    }
    if (this.elements.cameraControl) {
      logger.debug('Camera control set to: ', options.showCameraControl);
        this.elements.cameraControl.classList.toggle('hidden', !options.showCameraControl);
    }

    // Initialize managers
    this.deviceManager = new DeviceManager(this.elements);
    this.audioMeter = new AudioMeter(this.elements);
    this.streamManager = new StreamManager(this.elements, this.audioMeter, {
      initialStream: options.initialStream,
      onStreamUpdate: options.onStreamUpdate,
      onStateChange: (type, enabled) => {
        if (type === 'video') {
          this.onToggleVideo?.(enabled);
        } else if (type === 'audio') {
          this.onToggleMic?.(enabled);
        }
      }
    });
    this.audioTest = new AudioTest(this.elements);

    this.init();
  }

  cacheElements() {
    return {
      video: this.container.querySelector('#previewVideo'),
      cameraSelect: this.container.querySelector('#cameraSelect'),
      micSelect: this.container.querySelector('#micSelect'),
      speakerSelect: this.container.querySelector('#speakerSelect'),
      toggleCamera: this.container.querySelector('#toggleCamera'),
      toggleMic: this.container.querySelector('#toggleMic'),
      testAudio: this.container.querySelector('#testAudio'),
      meterFill: this.container.querySelector('.meter-fill'),
      cameraPlaceholder: this.container.querySelector('.camera-off-placeholder'),
      toggleLoopback: this.container.querySelector('#toggleLoopback'),
      testLoadingSpinner: this.container.querySelector('[data-test-loading]'),
      closeButton: this.container.querySelector('[data-modal-close]'),
      micControl: this.container.querySelector('#toggleMic'),
      cameraControl: this.container.querySelector('#toggleCamera')
    };
  }

  async init() {
    try {
      // Ensure all required elements are present
      const requiredElements = [
        'video',
        'cameraSelect',
        'micSelect',
        'speakerSelect',
        'meterFill'
      ];
      
      const missingElements = requiredElements.filter(
        id => !this.elements[id]
      );

      if (missingElements.length > 0) {
        throw new Error(`Missing required elements: ${missingElements.join(', ')}`);
      }

      await this.deviceManager.loadDevices();
      await this.streamManager.setupInitialStream();
      this.setupEventListeners();
      this.initAudioContextOnInteraction();
      
      logger.debug('Media settings initialized successfully');
    } catch (error) {
      logger.error({ error }, 'Failed to initialize media settings');
    }
  }

  setupEventListeners() {
    // Device selection changes
    this.elements.cameraSelect.addEventListener('change', () => 
      this.streamManager.updateVideoDevice(this.elements.cameraSelect.value));
    this.elements.micSelect.addEventListener('change', () => 
      this.streamManager.updateAudioDevice(this.elements.micSelect.value));
    this.elements.speakerSelect.addEventListener('change', () => 
      this.streamManager.updateAudioOutput(this.elements.speakerSelect.value));

    // Toggle controls
    this.elements.toggleCamera.addEventListener('click', () => {
      this.streamManager.toggleCamera();
      this.onToggleVideo?.(this.streamManager.stream.getVideoTracks()[0]?.enabled ?? false);
    });
    
    this.elements.toggleMic.addEventListener('click', () => {
      this.streamManager.toggleMicrophone();
      this.onToggleMic?.(this.streamManager.stream.getAudioTracks()[0]?.enabled ?? false);
    });
    this.elements.testAudio.addEventListener('click', () => 
      this.audioTest.playTestSound());
    this.elements.toggleLoopback.addEventListener('click', () => 
      this.streamManager.toggleLoopback());

    this.elements.closeButton.addEventListener('click', () => {
      this.container.classList.add('hidden');
    });
  }

  initAudioContextOnInteraction() {
    const initAudio = async () => {
      await this.audioMeter.initAudioContext(this.streamManager.stream);
      document.removeEventListener('click', initAudio);
      document.removeEventListener('keydown', initAudio);
    };

    document.addEventListener('click', initAudio);
    document.addEventListener('keydown', initAudio);
  }

  async getSettings() {
    return this.streamManager.getSettings();
  }

  destroy() {
    this.streamManager.destroy();
    this.audioMeter.destroy();
    this.audioTest.destroy();
  }
} 