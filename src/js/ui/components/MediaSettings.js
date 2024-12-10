import { uiLogger as log } from '../../utils/logger.js';

/**
 * Handles media device settings and preview functionality
 */
export class MediaSettings {
  constructor(container) {
    this.container = container;
    this.stream = null;
    this.audioContext = null;
    this.audioAnalyser = null;
    this.animationFrame = null;
    this.meterInitialized = false;
    this.loopbackNode = null;
    this.loopbackAudio = null;
    this.testAudioElement = null;

    // Cache DOM elements
    this.elements = {
      video: container.querySelector('#previewVideo'),
      cameraSelect: container.querySelector('#cameraSelect'),
      micSelect: container.querySelector('#micSelect'),
      speakerSelect: container.querySelector('#speakerSelect'),
      toggleCamera: container.querySelector('#toggleCamera'),
      toggleMic: container.querySelector('#toggleMic'),
      testAudio: container.querySelector('#testAudio'),
      meterFill: container.querySelector('.meter-fill'),
      cameraPlaceholder: container.querySelector('.camera-off-placeholder'),
      toggleLoopback: container.querySelector('#toggleLoopback'),
      testLoadingSpinner: container.querySelector('[data-test-loading]')
    };

    this.init();
  }

  /**
   * Initialize the media settings
   */
  async init() {
    try {
      // Load available devices first
      await this.loadDevices();
      
      // Setup initial stream with default devices
      await this.setupInitialStream();

      // Add event listeners
      this.setupEventListeners();
      
      // Initialize audio context on first user interaction
      const initAudioContext = async () => {
        try {
          // Create audio context
          this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
          await this.audioContext.resume();
          log.debug({ state: this.audioContext.state }, 'AudioContext created and resumed');

          // Create and configure analyzer
          this.audioAnalyser = this.audioContext.createAnalyser();
          this.audioAnalyser.fftSize = 2048;
          this.audioAnalyser.minDecibels = -85;
          this.audioAnalyser.maxDecibels = -15;
          this.audioAnalyser.smoothingTimeConstant = 0.5;

          // Create and connect audio source
          if (this.stream) {
            this.audioSource = this.audioContext.createMediaStreamSource(this.stream);
            this.audioSource.connect(this.audioAnalyser);
            log.debug('Audio source connected to analyzer');
          }

          // Start audio monitoring
          this.startAudioLevelMonitoring();

          // Remove event listeners since we only need this once
          document.removeEventListener('click', initAudioContext);
          document.removeEventListener('keydown', initAudioContext);
        } catch (error) {
          log.error({ error }, 'Failed to initialize audio context');
        }
      };

      // Add event listeners for user interaction
      document.addEventListener('click', initAudioContext);
      document.addEventListener('keydown', initAudioContext);
      
      log.debug('Media settings initialized successfully');
    } catch (error) {
      log.error({ error }, 'Failed to initialize media settings');
    }
  }

  /**
   * Load available media devices
   */
  async loadDevices() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      
      const cameras = devices.filter(device => device.kind === 'videoinput');
      const microphones = devices.filter(device => device.kind === 'audioinput');
      const speakers = devices.filter(device => device.kind === 'audiooutput');

      log.debug({ 
        camerasCount: cameras.length,
        microphonesCount: microphones.length,
        speakersCount: speakers.length 
      }, 'Loaded available devices');

      // Populate select elements
      this.populateDeviceSelect(this.elements.cameraSelect, cameras);
      this.populateDeviceSelect(this.elements.micSelect, microphones);
      this.populateDeviceSelect(this.elements.speakerSelect, speakers);
    } catch (error) {
      log.error({ error }, 'Failed to load media devices');
    }
  }

  /**
   * Populate a select element with device options
   */
  populateDeviceSelect(select, devices) {
    select.innerHTML = devices.map(device => `
      <option value="${device.deviceId}" class="truncate">
        ${device.label || `Device ${devices.indexOf(device) + 1}`}
      </option>
    `).join('');
  }

  /**
   * Setup the initial media stream
   */
  async setupInitialStream() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });

      // Setup video preview
      this.elements.video.srcObject = this.stream;
      
      log.debug({
        hasVideo: this.stream.getVideoTracks().length > 0,
        hasAudio: this.stream.getAudioTracks().length > 0
      }, 'Initial media stream setup complete');
    } catch (error) {
      log.error({ error }, 'Failed to setup initial media stream');
    }
  }

  /**
   * Setup event listeners for controls
   */
  setupEventListeners() {
    try {
      // Device selection changes
      this.elements.cameraSelect.addEventListener('change', () => this.updateVideoDevice());
      this.elements.micSelect.addEventListener('change', () => this.updateAudioDevice());
      this.elements.speakerSelect.addEventListener('change', () => this.updateAudioOutput());

      // Toggle controls
      this.elements.toggleCamera.addEventListener('click', () => this.toggleCamera());
      this.elements.toggleMic.addEventListener('click', () => this.toggleMicrophone());
      this.elements.testAudio.addEventListener('click', () => this.playTestSound());
      
      // Add loopback toggle
      this.elements.toggleLoopback.addEventListener('click', () => this.toggleLoopback());
      
      log.debug('Event listeners setup complete');
    } catch (error) {
      log.error({ error }, 'Failed to setup event listeners');
    }
  }

  /**
   * Update video device
   */
  async updateVideoDevice() {
    const deviceId = this.elements.cameraSelect.value;
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: deviceId } },
        audio: false
      });

      const videoTrack = newStream.getVideoTracks()[0];
      const oldTrack = this.stream.getVideoTracks()[0];
      
      if (oldTrack) oldTrack.stop();
      this.stream.removeTrack(oldTrack);
      this.stream.addTrack(videoTrack);
      
      this.elements.video.srcObject = this.stream;
      log.debug({ deviceId }, 'Video device updated successfully');
    } catch (error) {
      log.error({ error, deviceId }, 'Failed to update video device');
    }
  }

  /**
   * Update audio input device
   */
  async updateAudioDevice() {
    const deviceId = this.elements.micSelect.value;
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: { exact: deviceId } },
        video: false
      });

      const audioTrack = newStream.getAudioTracks()[0];
      const oldTrack = this.stream.getAudioTracks()[0];
      
      if (oldTrack) oldTrack.stop();
      this.stream.removeTrack(oldTrack);
      this.stream.addTrack(audioTrack);

      // Update audio analysis only if AudioContext is initialized
      if (this.audioContext) {
        const audioSource = this.audioContext.createMediaStreamSource(newStream);
        audioSource.connect(this.audioAnalyser);
      }
      log.debug({ deviceId }, 'Audio device updated successfully');
    } catch (error) {
      log.error({ error, deviceId }, 'Failed to update audio device');
    }
  }

  /**
   * Update audio output device
   */
  async updateAudioOutput() {
    const deviceId = this.elements.speakerSelect.value;
    if (this.elements.video.sinkId !== undefined) {
      try {
        await this.elements.video.setSinkId(deviceId);
        log.debug({ deviceId }, 'Audio output updated successfully');
      } catch (error) {
        log.error({ error, deviceId }, 'Failed to update audio output');
      }
    }
  }

  /**
   * Toggle camera
   */
  toggleCamera() {
    try {
      const videoTrack = this.stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        this.elements.toggleCamera.dataset.active = videoTrack.enabled;
        this.elements.cameraPlaceholder.classList.toggle('hidden', videoTrack.enabled);
        log.debug({ enabled: videoTrack.enabled }, 'Camera toggled');
      } else {
        log.warn('No video track found when trying to toggle camera');
      }
    } catch (error) {
      log.error({ error }, 'Failed to toggle camera');
    }
  }

  /**
   * Toggle microphone
   */
  toggleMicrophone() {
    try {
      const audioTrack = this.stream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        this.elements.toggleMic.dataset.active = audioTrack.enabled;
        log.debug({ enabled: audioTrack.enabled }, 'Microphone toggled');
      } else {
        log.warn('No audio track found when trying to toggle microphone');
      }
    } catch (error) {
      log.error({ error }, 'Failed to toggle microphone');
    }
  }

  /**
   * Play test sound for audio output
   */
  async playTestSound() {
    try {
      // Show loading state
      const button = this.elements.testAudio;
      const icon = button.querySelector('[data-test-icon]');
      const spinner = button.querySelector('[data-test-spinner]');
      
      // Show spinner, hide icon
      icon.style.opacity = '0';
      spinner.style.opacity = '1';
      button.dataset.testing = 'true';
      
      // Create audio element if it doesn't exist
      if (!this.testAudioElement) {
        this.testAudioElement = new Audio('/sample.flac');
        this.testAudioElement.addEventListener('ended', () => {
          // Reset state when audio ends
          icon.style.opacity = '1';
          spinner.style.opacity = '0';
          button.dataset.testing = 'false';
        });
      }
      
      const deviceId = this.elements.speakerSelect.value;
      if (deviceId) {
        await this.testAudioElement.setSinkId(deviceId);
      }
      
      await this.testAudioElement.play();
      log.debug({ deviceId }, 'Test sound playing');
    } catch (error) {
      // Reset visual state on error
      const button = this.elements.testAudio;
      const icon = button.querySelector('[data-test-icon]');
      const spinner = button.querySelector('[data-test-spinner]');
      
      icon.style.opacity = '1';
      spinner.style.opacity = '0';
      button.dataset.testing = 'false';
      
      log.error({ error }, 'Failed to play test sound');
    }
  }

  /**
   * Start monitoring audio levels for meter display
   */
  startAudioLevelMonitoring() {
    try {
      if (!this.audioContext || !this.audioAnalyser || !this.audioSource) {
        log.warn('Audio context not initialized yet');
        return;
      }

      let frameCount = 0;
      let smoothedLevel = 0;
      
      // Create meter segments
      const meterContainer = this.elements.meterFill.parentElement;
      meterContainer.innerHTML = ''; // Clear existing content
      meterContainer.style.display = 'flex';
      meterContainer.style.gap = '2px';
      
      // Create 20 segments
      for (let i = 0; i < 20; i++) {
        const segment = document.createElement('div');
        segment.style.flex = '1';
        segment.style.height = '100%';
        segment.style.backgroundColor = 'rgb(51, 65, 85)'; // slate-700
        segment.style.transition = 'background-color 100ms';
        
        // Color based on position
        if (i >= 16) { // Last 4 segments red
          segment.dataset.activeColor = 'rgb(239, 68, 68)'; // red-500
        } else if (i >= 12) { // Next 4 segments yellow
          segment.dataset.activeColor = 'rgb(234, 179, 8)'; // yellow-500
        } else if (i >= 3) { // Middle segments green
          segment.dataset.activeColor = 'rgb(132, 204, 22)'; // lime-500
        } else { // First 3 segments slate
          segment.dataset.activeColor = 'rgb(148, 163, 184)'; // slate-400
        }
        
        meterContainer.appendChild(segment);
      }
      
      const segments = meterContainer.children;
      
      const updateMeter = () => {
        try {
          const timeData = new Float32Array(this.audioAnalyser.frequencyBinCount);
          this.audioAnalyser.getFloatTimeDomainData(timeData);
          
          // Calculate RMS value
          let sum = 0;
          for (const sample of timeData) {
            sum += sample * sample;
          }
          const rms = Math.sqrt(sum / timeData.length);
          
          // Convert to dB
          const db = 20 * Math.log10(Math.max(rms, 0.000001));
          
          // Normalize to percentage with adjusted range
          const targetLevel = Math.max(0, Math.min(100,
            ((db + 85) / 70) * 100  // Map -85dB -> 0%, -15dB -> 100%
          ));
          
          // Smooth the level changes
          smoothedLevel = smoothedLevel * 0.85 + targetLevel * 0.15;
          
          // Calculate how many segments should be active
          const activeSegments = Math.floor((smoothedLevel / 100) * segments.length);
          
          // Update segments
          for (let i = 0; i < segments.length; i++) {
            segments[i].style.backgroundColor = i < activeSegments 
              ? segments[i].dataset.activeColor 
              : 'rgb(51, 65, 85)';
          }
          
          // Log values periodically
          if (frameCount % 60 === 0) {
            log.debug({
              rms,
              db,
              targetLevel,
              smoothedLevel,
              activeSegments
            }, 'Audio meter values');
          }
          
          frameCount++;
          this.animationFrame = requestAnimationFrame(updateMeter);
        } catch (error) {
          log.error({ error }, 'Error in audio meter update loop');
        }
      };

      updateMeter();
      log.debug('Audio level monitoring started');
    } catch (error) {
      log.error({ error }, 'Failed to start audio level monitoring');
    }
  }

  /**
   * Get current settings
   */
  async getSettings() {
    try {
      const settings = {
        videoEnabled: this.stream.getVideoTracks()[0]?.enabled ?? false,
        audioEnabled: this.stream.getAudioTracks()[0]?.enabled ?? false,
        selectedDevices: {
          camera: this.elements.cameraSelect.value,
          microphone: this.elements.micSelect.value,
          speaker: this.elements.speakerSelect.value
        },
        stream: this.stream
      };
      
      log.debug({ 
        videoEnabled: settings.videoEnabled,
        audioEnabled: settings.audioEnabled,
        devices: settings.selectedDevices
      }, 'Retrieved current settings');
      
      return settings;
    } catch (error) {
      log.error({ error }, 'Failed to get current settings');
      return null;
    }
  }

  /**
   * Clean up resources
   */
  destroy() {
    try {
      if (this.stream) {
        this.stream.getTracks().forEach(track => track.stop());
      }
      if (this.audioContext) {
        this.audioContext.close();
      }
      if (this.animationFrame) {
        cancelAnimationFrame(this.animationFrame);
      }
      if (this.loopbackAudio) {
        this.loopbackAudio.pause();
        this.loopbackAudio.srcObject = null;
        this.loopbackAudio = null;
      }
      if (this.loopbackNode) {
        this.loopbackNode.disconnect();
        this.loopbackNode = null;
      }
      if (this.testAudioElement) {
        this.testAudioElement.pause();
        this.testAudioElement = null;
      }
      log.debug('Media settings cleanup complete');
    } catch (error) {
      log.error({ error }, 'Error during media settings cleanup');
    }
  }

  /**
   * Toggle audio loopback
   */
  async toggleLoopback() {
    try {
      const isActive = this.elements.toggleLoopback.dataset.active === 'true';
      
      if (isActive) {
        // Disconnect loopback
        if (this.loopbackNode) {
          this.loopbackNode.disconnect();
          this.loopbackNode = null;
        }
        // Stop and cleanup audio element
        if (this.loopbackAudio) {
          this.loopbackAudio.pause();
          this.loopbackAudio.srcObject = null;
          this.loopbackAudio = null;
        }
      } else {
        // Create and connect loopback
        this.loopbackNode = this.audioContext.createMediaStreamDestination();
        this.audioSource.connect(this.loopbackNode);
        
        // Create and start audio playback
        this.loopbackAudio = new Audio();
        this.loopbackAudio.srcObject = this.loopbackNode.stream;
        await this.loopbackAudio.play();
      }
      
      // Just update the data attribute, let CSS handle the styling
      this.elements.toggleLoopback.dataset.active = !isActive;
      
      log.debug({ loopbackEnabled: !isActive }, 'Audio loopback toggled');
    } catch (error) {
      log.error({ error }, 'Failed to toggle audio loopback');
    }
  }
} 