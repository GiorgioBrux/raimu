import { uiLogger as log } from '../../../utils/logger.js';

export class StreamManager {
  constructor(elements, audioMeter, options = {}) {
    this.elements = elements;
    this.audioMeter = audioMeter;
    this.onStreamUpdate = options.onStreamUpdate;
    this.onStateChange = options.onStateChange;
    this.stream = options.initialStream || null;
  }

  async setupInitialStream() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });

      this.elements.video.srcObject = this.stream;
      
      log.debug({
        hasVideo: this.stream.getVideoTracks().length > 0,
        hasAudio: this.stream.getAudioTracks().length > 0
      }, 'Initial media stream setup complete');

      return this.stream;
    } catch (error) {
      log.error({ error }, 'Failed to setup initial media stream');
      throw error;
    }
  }

  async ensureStream() {
    if (!this.stream) {
      log.debug('No stream exists, setting up initial stream');
      await this.setupInitialStream();
    }
    return this.stream;
  }

  async updateVideoDevice(deviceId) {
    try {
        log.debug({ deviceId }, 'Updating video device');
        await this.ensureStream();

        const newStream = await navigator.mediaDevices.getUserMedia({
            video: { deviceId: { exact: deviceId } },
            audio: false
        });

        const videoTrack = newStream.getVideoTracks()[0];
        const oldTrack = this.stream.getVideoTracks()[0];
        
        log.debug({
            newTrackId: videoTrack?.id,
            oldTrackId: oldTrack?.id,
            deviceId
        }, 'Replacing video track');

        if (oldTrack) oldTrack.stop();
        this.stream.removeTrack(oldTrack);
        this.stream.addTrack(videoTrack);
        
        this.elements.video.srcObject = this.stream;
        this.saveSettings();
        log.debug({ deviceId, trackId: videoTrack.id }, 'Video device updated successfully');
        if (this.onStreamUpdate) {
            this.onStreamUpdate(this.stream);
        }
    } catch (error) {
        log.error({ error, deviceId }, 'Failed to update video device');
        throw error;
    }
  }

  async updateAudioDevice(deviceId) {
    try {
        log.debug({ deviceId }, 'Updating audio device');
        await this.ensureStream();

        const newStream = await navigator.mediaDevices.getUserMedia({
            audio: { deviceId: { exact: deviceId } },
            video: false
        });

        const audioTrack = newStream.getAudioTracks()[0];
        const oldTrack = this.stream.getAudioTracks()[0];
        
        log.debug({
            newTrackId: audioTrack?.id,
            oldTrackId: oldTrack?.id,
            deviceId
        }, 'Replacing audio track');

        if (oldTrack) oldTrack.stop();
        this.stream.removeTrack(oldTrack);
        this.stream.addTrack(audioTrack);

        if (this.audioMeter && this.audioMeter.audioContext && this.audioMeter.audioSource) {
            this.audioMeter.audioSource.disconnect();
            this.audioMeter.audioSource = this.audioMeter.audioContext.createMediaStreamSource(this.stream);
            this.audioMeter.audioSource.connect(this.audioMeter.audioAnalyser);
        }

        this.saveSettings();
        log.debug({ deviceId, trackId: audioTrack.id }, 'Audio device updated successfully');
        if (this.onStreamUpdate) {
            this.onStreamUpdate(this.stream);
        }
    } catch (error) {
        log.error({ error, deviceId }, 'Failed to update audio device');
        throw error;
    }
  }

  async updateAudioOutput(deviceId) {
    if (this.elements.video.sinkId !== undefined) {
      try {
        await this.elements.video.setSinkId(deviceId);
        this.saveSettings();
        log.debug({ deviceId }, 'Audio output updated successfully');
      } catch (error) {
        log.error({ error, deviceId }, 'Failed to update audio output');
      }
    }
  }

  toggleCamera() {
    try {
        // Find and trigger the main room control button
        const roomVideoBtn = document.getElementById('toggleVideo');
        if (roomVideoBtn) {
            roomVideoBtn.click();

            const activeText = this.elements.toggleCamera.querySelector('[data-active-text]');
            const inactiveText = this.elements.toggleCamera.querySelector('[data-inactive-text]');
            activeText.classList.toggle('hidden', !videoTrack.enabled);
            inactiveText.classList.toggle('hidden', videoTrack.enabled);

            return;
        }

        // Fallback for when not in room (e.g., join page)
        const videoTrack = this.stream.getVideoTracks()[0];
        if (videoTrack) {
            videoTrack.enabled = !videoTrack.enabled;
            this.elements.toggleCamera.dataset.active = videoTrack.enabled;
            this.elements.cameraPlaceholder.classList.toggle('hidden', videoTrack.enabled);
            
            // Toggle tooltip text visibility
            const activeText = this.elements.toggleCamera.querySelector('[data-active-text]');
            const inactiveText = this.elements.toggleCamera.querySelector('[data-inactive-text]');
            activeText.classList.toggle('hidden', !videoTrack.enabled);
            inactiveText.classList.toggle('hidden', videoTrack.enabled);
            
            this.saveSettings();
            log.debug({ enabled: videoTrack.enabled }, 'Camera toggled');
        }
    } catch (error) {
        log.error({ error }, 'Failed to toggle camera');
    }
  }

  toggleMicrophone() {
    try {
        // Find and trigger the main room control button
        const roomAudioBtn = document.getElementById('toggleAudio');
        if (roomAudioBtn) {
            roomAudioBtn.click();
            return;
        }

        // Fallback for when not in room (e.g., join page)
        const audioTrack = this.stream.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = !audioTrack.enabled;
            this.elements.toggleMic.dataset.active = audioTrack.enabled;
            
            // Toggle tooltip text visibility
            const activeText = this.elements.toggleMic.querySelector('[data-active-text]');
            const inactiveText = this.elements.toggleMic.querySelector('[data-inactive-text]');
            activeText.classList.toggle('hidden', !audioTrack.enabled);
            inactiveText.classList.toggle('hidden', audioTrack.enabled);
            
            this.saveSettings();
            log.debug({ enabled: audioTrack.enabled }, 'Microphone toggled');
        }
    } catch (error) {
        log.error({ error }, 'Failed to toggle microphone');
    }
  }

  async toggleLoopback() {
    try {
      const isActive = this.elements.toggleLoopback.dataset.active === 'true';
      
      if (isActive) {
        if (this.loopbackNode) {
          this.loopbackNode.disconnect();
          this.loopbackNode = null;
        }
        if (this.loopbackAudio) {
          this.loopbackAudio.pause();
          this.loopbackAudio.srcObject = null;
          this.loopbackAudio = null;
        }
      } else {
        if (!this.audioMeter || !this.audioMeter.audioContext || !this.audioMeter.audioSource) {
          log.error('Audio context not initialized. Try clicking somewhere first.');
          return;
        }

        this.loopbackNode = this.audioMeter.audioContext.createMediaStreamDestination();
        this.audioMeter.audioSource.connect(this.loopbackNode);
        
        this.loopbackAudio = new Audio();
        this.loopbackAudio.srcObject = this.loopbackNode.stream;
        await this.loopbackAudio.play();
      }
      
      // Toggle tooltip text visibility
      const activeText = this.elements.toggleLoopback.querySelector('[data-active-text]');
      const inactiveText = this.elements.toggleLoopback.querySelector('[data-inactive-text]');
      activeText.classList.toggle('hidden', isActive);
      inactiveText.classList.toggle('hidden', !isActive);
      
      this.elements.toggleLoopback.dataset.active = !isActive;
      log.debug({ loopbackEnabled: !isActive }, 'Audio loopback toggled');
    } catch (error) {
      log.error({ error }, 'Failed to toggle audio loopback');
    }
  }

  getSettings() {
    try {
      if (!this.stream) {
        log.debug('No stream available for settings');
        return {
          videoEnabled: false,
          audioEnabled: false,
          selectedDevices: {
            camera: this.elements.cameraSelect.value,
            microphone: this.elements.micSelect.value,
            speaker: this.elements.speakerSelect.value
          }
        };
      }

      const settings = {
        videoEnabled: this.stream.getVideoTracks()[0]?.enabled ?? false,
        audioEnabled: this.stream.getAudioTracks()[0]?.enabled ?? false,
        selectedDevices: {
          camera: this.elements.cameraSelect.value,
          microphone: this.elements.micSelect.value,
          speaker: this.elements.speakerSelect.value
        }
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

  destroy() {
    try {
      if (this.stream) {
        this.stream.getTracks().forEach(track => track.stop());
      }
      if (this.audioMeter && this.audioMeter.audioContext) {
        this.audioMeter.audioContext.close();
      }
      if (this.loopbackAudio) {
        this.loopbackAudio.pause();
        this.loopbackAudio.srcObject = null;
      }
      if (this.loopbackNode) {
        this.loopbackNode.disconnect();
      }
      log.debug('Stream manager cleanup complete');
    } catch (error) {
      log.error({ error }, 'Error during stream manager cleanup');
    }
  }

  saveSettings() {
    const settings = this.getSettings();
    sessionStorage.setItem('mediaSettings', JSON.stringify({
      ...JSON.parse(sessionStorage.getItem('mediaSettings') || '{}'),
      videoEnabled: settings.videoEnabled,
      audioEnabled: settings.audioEnabled,
      selectedDevices: settings.selectedDevices
    }));
  }

  async setVideoEnabled(enabled) {
    const videoTrack = this.stream?.getVideoTracks()[0];
    if (videoTrack) {
        videoTrack.enabled = enabled;
        this.elements.toggleCamera.dataset.active = enabled;
        this.elements.cameraPlaceholder.classList.toggle('hidden', enabled);
        
        // Toggle tooltip text visibility
        const activeText = this.elements.toggleCamera.querySelector('[data-active-text]');
        const inactiveText = this.elements.toggleCamera.querySelector('[data-inactive-text]');
        activeText.classList.toggle('hidden', !enabled);
        inactiveText.classList.toggle('hidden', enabled);
        
        this.saveSettings();
        log.debug({ enabled }, 'Video enabled state set');
    }
  }

  async setAudioEnabled(enabled) {
    const audioTrack = this.stream?.getAudioTracks()[0];
    if (audioTrack) {
        audioTrack.enabled = enabled;
        this.elements.toggleMic.dataset.active = enabled;
        
        // Toggle tooltip text visibility
        const activeText = this.elements.toggleMic.querySelector('[data-active-text]');
        const inactiveText = this.elements.toggleMic.querySelector('[data-inactive-text]');
        activeText.classList.toggle('hidden', !enabled);
        inactiveText.classList.toggle('hidden', enabled);
        
        this.saveSettings();
        log.debug({ enabled }, 'Audio enabled state set');
    }
  }
} 