import { uiLogger as log } from '../../../utils/logger.js';

export class StreamManager {
  constructor(elements, audioMeter) {
    this.elements = elements;
    this.audioMeter = audioMeter;
    this.stream = null;
    this.loopbackNode = null;
    this.loopbackAudio = null;
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
    } catch (error) {
      log.error({ error }, 'Failed to setup initial media stream');
    }
  }

  async updateVideoDevice(deviceId) {
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

  async updateAudioDevice(deviceId) {
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

      if (this.audioMeter && this.audioMeter.audioContext && this.audioMeter.audioSource) {
        this.audioMeter.audioSource.disconnect();
        this.audioMeter.audioSource = this.audioMeter.audioContext.createMediaStreamSource(this.stream);
        this.audioMeter.audioSource.connect(this.audioMeter.audioAnalyser);
      }

      log.debug({ deviceId }, 'Audio device updated successfully');
    } catch (error) {
      log.error({ error, deviceId }, 'Failed to update audio device');
    }
  }

  async updateAudioOutput(deviceId) {
    if (this.elements.video.sinkId !== undefined) {
      try {
        await this.elements.video.setSinkId(deviceId);
        log.debug({ deviceId }, 'Audio output updated successfully');
      } catch (error) {
        log.error({ error, deviceId }, 'Failed to update audio output');
      }
    }
  }

  toggleCamera() {
    try {
      const videoTrack = this.stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        this.elements.toggleCamera.dataset.active = videoTrack.enabled;
        this.elements.cameraPlaceholder.classList.toggle('hidden', videoTrack.enabled);
        log.debug({ enabled: videoTrack.enabled }, 'Camera toggled');
      }
    } catch (error) {
      log.error({ error }, 'Failed to toggle camera');
    }
  }

  toggleMicrophone() {
    try {
      const audioTrack = this.stream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        this.elements.toggleMic.dataset.active = audioTrack.enabled;
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
      
      this.elements.toggleLoopback.dataset.active = !isActive;
      log.debug({ loopbackEnabled: !isActive }, 'Audio loopback toggled');
    } catch (error) {
      log.error({ error }, 'Failed to toggle audio loopback');
    }
  }

  getSettings() {
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
} 