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

    // Initialize resize observer for decorative section
    this.setupResizeObserver();

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
      cameraControl: this.container.querySelector('#toggleCamera'),
      decorativeSection: this.container.querySelector('[data-decorative-section]')
    };
  }

  setupResizeObserver() {
    if (!this.elements.decorativeSection) {
      logger.debug('No decorative section found');
      return;
    }

    let timeout;
    let isProcessing = false;

    this.resizeObserver = new ResizeObserver(entries => {
      if (isProcessing) return;

      // Clear any pending timeout
      if (timeout) {
        clearTimeout(timeout);
      }

      // Debounce the resize handling
      timeout = setTimeout(() => {
        isProcessing = true;

        try {
          const container = entries[0];
          const mainContent = this.container.querySelector('.flex.flex-col.gap-6');
          
          const elementInfo = {
            containerHeight: this.container.offsetHeight,
            mainContentHeight: mainContent?.offsetHeight || 0,
            decorativeSectionHeight: this.elements.decorativeSection.offsetHeight,
            windowHeight: window.innerHeight
          };
          logger.debug('Height measurements: ' + JSON.stringify(elementInfo));

          if (!mainContent) {
            logger.debug('Main content section not found');
            isProcessing = false;
            return;
          }

          // Use offsetHeight for more reliable measurements
          const mainContentHeight = mainContent.offsetHeight;
          const containerHeight = this.container.offsetHeight;
          const availableSpace = containerHeight - mainContentHeight;

          // Show only if we have significant space
          const SPACE_THRESHOLD = 300;
          
          logger.debug('Space calculation: ' + JSON.stringify({
            containerHeight,
            mainContentHeight,
            availableSpace,
            threshold: SPACE_THRESHOLD,
            shouldShow: availableSpace > SPACE_THRESHOLD
          }));

          if (availableSpace > SPACE_THRESHOLD) {
            logger.debug('Showing decorative section - available space: ' + availableSpace + 'px');
            this.elements.decorativeSection.style.display = 'block';
          } else {
            logger.debug('Hiding decorative section - not enough space: ' + availableSpace + 'px');
            this.elements.decorativeSection.style.display = 'none';
          }
        } catch (error) {
          logger.error('Error in resize observer:', error);
        }

        isProcessing = false;
      }, 200);
    });

    this.resizeObserver.observe(this.container);
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
      
      // First set up initial stream
      await this.streamManager.setupInitialStream();
      
      // Then load saved settings
      const savedSettings = sessionStorage.getItem('mediaSettings');
      logger.debug('Loading saved settings from storage: ', savedSettings);

      if (savedSettings) {
        const settings = JSON.parse(savedSettings);
        logger.debug('Parsed settings:', settings);

        if (settings.selectedDevices) {
          logger.debug('Found device settings:', settings.selectedDevices);
          
          // Log available devices first
          logger.debug('Available devices:', {
            cameras: Array.from(this.elements.cameraSelect.options).map(o => o.value),
            microphones: Array.from(this.elements.micSelect.options).map(o => o.value),
            speakers: Array.from(this.elements.speakerSelect.options).map(o => o.value)
          });

          if (settings.selectedDevices.camera) {
            logger.debug('Setting camera:', settings.selectedDevices.camera);
            // First check if the device still exists
            if (Array.from(this.elements.cameraSelect.options).some(opt => opt.value === settings.selectedDevices.camera)) {
              this.elements.cameraSelect.value = settings.selectedDevices.camera;
              await this.streamManager.updateVideoDevice(settings.selectedDevices.camera);
            } else {
              logger.warn('Saved camera no longer available:', settings.selectedDevices.camera);
            }
          }

          if (settings.selectedDevices.microphone) {
            logger.debug('Setting microphone:', settings.selectedDevices.microphone);
            if (Array.from(this.elements.micSelect.options).some(opt => opt.value === settings.selectedDevices.microphone)) {
              this.elements.micSelect.value = settings.selectedDevices.microphone;
              await this.streamManager.updateAudioDevice(settings.selectedDevices.microphone);
            } else {
              logger.warn('Saved microphone no longer available:', settings.selectedDevices.microphone);
            }
          }

          if (settings.selectedDevices.speaker) {
            logger.debug('Setting speaker:', settings.selectedDevices.speaker);
            if (Array.from(this.elements.speakerSelect.options).some(opt => opt.value === settings.selectedDevices.speaker)) {
              this.elements.speakerSelect.value = settings.selectedDevices.speaker;
              await this.streamManager.updateAudioOutput(settings.selectedDevices.speaker);
            } else {
              logger.warn('Saved speaker no longer available:', settings.selectedDevices.speaker);
            }
          }
        }

        // Apply enabled states after all device updates
        if (settings.videoEnabled !== undefined) {
          await this.streamManager.setVideoEnabled(settings.videoEnabled);
        }
        if (settings.audioEnabled !== undefined) {
          await this.streamManager.setAudioEnabled(settings.audioEnabled);
        }
      } else {
        logger.debug('No saved settings found, setting up initial stream');
        await this.streamManager.setupInitialStream();
      }

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
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
  }
} 