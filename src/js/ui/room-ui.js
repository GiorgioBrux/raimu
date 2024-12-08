export class RoomUI {
  constructor(roomManager) {
    this.roomManager = roomManager;
    this.elements = {};
    this.initialized = false;
    this.audioContext = null;
    this.audioAnalysers = new Map();
  }

  async initialize() {
    try {
      await this.initializeWithRetry();
      this.setupEventListeners();
      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize room UI:', error);
      throw new Error('Failed to initialize room UI');
    }
  }

  async initializeWithRetry(maxRetries = 5, delay = 200) {
    for (let i = 0; i < maxRetries; i++) {
      if (await this.initializeElements()) {
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    return false;
  }

  async initializeElements() {
    try {
      const elements = {
        videoGrid: document.getElementById('videoGrid'),
        localVideo: document.getElementById('localVideo'),
        remoteTemplate: document.getElementById('remoteVideoTemplate'),
        roomName: document.getElementById('roomName'),
        controls: this.initializeControls()
      };

      if (this.validateElements(elements)) {
        this.elements = elements;
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error initializing elements:', error);
      return false;
    }
  }

  initializeControls() {
    return {
      audio: document.getElementById('toggleAudio'),
      video: document.getElementById('toggleVideo'),
      screen: document.getElementById('shareScreen'),
      leave: document.getElementById('leaveCall'),
      transcribe: document.getElementById('toggleTranscription'),
      chat: document.getElementById('toggleChat')
    };
  }

  validateElements(elements) {
    return !Object.values(elements).some(el => !el) && 
           !Object.values(elements.controls).some(el => !el);
  }

  setupEventListeners() {
    this.elements.controls.audio.addEventListener('click', () => this.toggleAudio());
    this.elements.controls.video.addEventListener('click', () => this.toggleVideo());
    this.elements.controls.screen.addEventListener('click', () => this.handleScreenShare());
    this.elements.controls.leave.addEventListener('click', () => this.handleLeaveRoom());
    
    this.elements.controls.transcribe.addEventListener('click', () => {
      this.togglePanel('transcriptionText');
    });
    this.elements.controls.chat.addEventListener('click', () => {
      this.togglePanel('chatMessages');
    });
  }

  toggleAudio() {
    const button = this.elements.controls.audio;
    const isMuted = button.dataset.muted === 'true';
    const newState = !isMuted;

    this.roomManager.webrtc.toggleAudio(!newState);

    this.updateAudioState(newState);
  }

  toggleVideo() {
    const button = this.elements.controls.video;
    const isDisabled = button.dataset.disabled === 'true';
    const newState = !isDisabled;

    this.roomManager.webrtc.toggleVideo(!newState);

    this.updateVideoState(newState);
  }

  handleScreenShare() {
    this.roomManager.webrtc.shareScreen();
  }

  handleLeaveRoom() {
    this.cleanup();
    this.roomManager.leaveRoom();
    window.appRouter.navigate('/');
  }

  togglePanel(elementId) {
    const panel = document.getElementById(elementId)?.parentElement;
    if (!panel) return;

    const isExpanded = panel.classList.contains('panel-expanded');
    
    panel.classList.remove('panel-expanded', 'panel-collapsed');
    
    void panel.offsetWidth;
    
    panel.classList.add(isExpanded ? 'panel-collapsed' : 'panel-expanded');
  }

  updateAudioState(muted) {
    const button = this.elements.controls.audio;
    button.dataset.muted = muted;

    button.querySelectorAll('[data-muted]').forEach(el => {
      el.dataset.muted = muted;
    });

    const localContainer = this.elements.localVideo?.parentElement;
    if (localContainer) {
      const audioIndicator = localContainer.querySelector('[data-tooltip="Audio status"] svg');
      if (audioIndicator) {
        const slashLine = audioIndicator.querySelector('.slash');
        if (slashLine) {
          slashLine.classList.toggle('hidden', !muted);
        }
      }
    }
  }

  updateVideoState(disabled) {
    const button = this.elements.controls.video;
    button.dataset.disabled = disabled;

    button.querySelectorAll('[data-disabled]').forEach(el => {
      el.dataset.disabled = disabled;
    });

    const localContainer = this.elements.localVideo?.parentElement;
    if (localContainer) {
      localContainer.classList.toggle('peer-video-off', disabled);
      
      const videoElement = this.elements.localVideo;
      if (videoElement) {
        videoElement.classList.toggle('opacity-0', disabled);
      }

      const indicator = localContainer.querySelector('[data-tooltip="Video status"]');
      if (indicator) {
        indicator.dataset.disabled = disabled;
      }
    }
  }

  toggleVisibility(element, show) {
    if (!element) return;

    element.classList.remove('hidden-content', 'visible-content');
    
    void element.offsetWidth;
    
    element.classList.add(show ? 'visible-content' : 'hidden-content');
  }

  updateVideoVisibility(container, show) {
    if (!container) return;

    const videoElement = container.querySelector('video');
    if (!videoElement) return;

    videoElement.classList.remove('video-hidden', 'video-visible');
    
    void videoElement.offsetWidth;
    
    videoElement.classList.add(show ? 'video-visible' : 'video-hidden');
    
    container.classList.toggle('peer-video-off', !show);
  }

  updateControlState(button, enabled, attribute) {
    if (!button) return;

    if (attribute === 'data-camera') {
      button.setAttribute(attribute, enabled ? 'on' : 'off');
    } 
    else if (attribute === 'data-muted') {
      button.setAttribute(attribute, !enabled);
    }
    
    this.toggleVisibility(
      button.querySelector('.unmuted-text'), 
      enabled
    );
    this.toggleVisibility(
      button.querySelector('.muted-text'), 
      !enabled
    );
  }

  updateSpeakingIndicators(container, speaking) {
    const speakingIndicator = container.querySelector('.peer-speaking');
    const statusDot = container.querySelector('.bg-emerald-500');

    if (speakingIndicator) {
      this.toggleVisibility(speakingIndicator, speaking);
      speakingIndicator.classList.toggle('active', speaking);
    }

    if (statusDot) {
      statusDot.classList.toggle('animate-pulse', speaking);
    }
  }

  addParticipantVideo(participantId, stream) {
    if (!this.initialized) return;

    const clone = this.elements.remoteTemplate.content.cloneNode(true);
    const container = clone.querySelector('div');
    container.id = `participant-${participantId}`;
    
    const video = clone.querySelector('video');
    video.srcObject = stream;
    
    this.setupParticipantVideoStates(container, stream);
    this.setupSpeakingDetection(stream, container);
    
    this.elements.videoGrid.appendChild(clone);
  }

  setupParticipantVideoStates(container, stream) {
    const videoTrack = stream.getVideoTracks()[0];
    const audioTrack = stream.getAudioTracks()[0];
    
    container.classList.toggle('peer-video-off', !videoTrack?.enabled);
    container.classList.toggle('peer-muted', !audioTrack?.enabled);
    
    if (videoTrack) {
      videoTrack.onmute = () => container.classList.add('peer-video-off');
      videoTrack.onunmute = () => container.classList.remove('peer-video-off');
      videoTrack.onended = () => container.classList.add('peer-video-off');
    }
    
    if (audioTrack) {
      audioTrack.onmute = () => container.classList.add('peer-muted');
      audioTrack.onunmute = () => container.classList.remove('peer-muted');
      audioTrack.onended = () => container.classList.add('peer-muted');
    }
  }

  removeParticipantVideo(participantId) {
    if (!this.initialized) return;
    const container = document.getElementById(`participant-${participantId}`);
    if (container) {
      this.cleanupAudioAnalyser(participantId);
      container.remove();
    }
  }

  cleanupAudioAnalyser(participantId) {
    const analyser = this.audioAnalysers.get(participantId);
    if (analyser) {
      analyser.disconnect();
      this.audioAnalysers.delete(participantId);
    }
  }

  setLocalStream(stream) {
    if (!this.initialized) return;
    
    const videoTrack = stream.getVideoTracks()[0];
    const audioTrack = stream.getAudioTracks()[0];
    
    const isVideoEnabled = videoTrack?.enabled ?? false;
    const isAudioEnabled = audioTrack?.enabled ?? false;
    
    this.updateVideoState(!isVideoEnabled);
    this.updateAudioState(!isAudioEnabled);
    
    this.elements.localVideo.srcObject = stream;
    
    this.setupSpeakingDetection(stream, this.elements.localVideo.parentElement);
  }

  updateInitialControlStates(isVideoEnabled, isAudioEnabled) {
    const audioButton = this.elements.controls.audio;
    const videoButton = this.elements.controls.video;
    
    audioButton.setAttribute('data-muted', !isAudioEnabled);
    videoButton.setAttribute('data-camera', isVideoEnabled ? 'on' : 'off');
    
    this.toggleVisibility(
      audioButton.querySelector('.unmuted-text'), 
      isAudioEnabled
    );
    this.toggleVisibility(
      audioButton.querySelector('.muted-text'), 
      !isAudioEnabled
    );
    this.toggleVisibility(
      videoButton.querySelector('.unmuted-text'), 
      isVideoEnabled
    );
    this.toggleVisibility(
      videoButton.querySelector('.muted-text'), 
      !isVideoEnabled
    );
  }

  updateLocalVideoContainer(isVideoEnabled, isAudioEnabled) {
    const localContainer = this.elements.localVideo?.parentElement;
    if (!localContainer) return;

    const audioIndicator = localContainer.querySelector('[data-tooltip="Audio status"] svg');
    const videoIndicator = localContainer.querySelector('[data-tooltip="Video status"] svg');
    
    audioIndicator?.querySelector('.slash')?.classList.toggle('hidden', isAudioEnabled);
    videoIndicator?.querySelector('.slash')?.classList.toggle('hidden', isVideoEnabled);
    
    localContainer.classList.toggle('peer-video-off', !isVideoEnabled);
  }

  setupSpeakingDetection(stream, container) {
    if (!stream || !container) return;
    
    try {
      if (!this.audioContext) {
        this.audioContext = new AudioContext();
      }
      
      const analyser = this.audioContext.createAnalyser();
      const microphone = this.audioContext.createMediaStreamSource(stream);
      const scriptProcessor = this.audioContext.createScriptProcessor(2048, 1, 1);
      
      this.setupAudioAnalysis(analyser, microphone, scriptProcessor);
      this.setupSpeakingIndicator(stream, container, analyser, scriptProcessor);
      
      this.audioAnalysers.set(container.id, {
        analyser,
        scriptProcessor,
        microphone
      });
    } catch (error) {
      console.error('Error setting up audio analysis:', error);
    }
  }

  setupAudioAnalysis(analyser, microphone, scriptProcessor) {
    analyser.smoothingTimeConstant = 0.8;
    analyser.fftSize = 1024;
    
    microphone.connect(analyser);
    analyser.connect(scriptProcessor);
    scriptProcessor.connect(this.audioContext.destination);
  }

  setupSpeakingIndicator(stream, container, analyser, scriptProcessor) {
    let speakingTimeout = null;
    const volumeHistory = new Array(5).fill(0);
    
    scriptProcessor.onaudioprocess = () => {
      const audioTrack = stream.getAudioTracks()[0];
      if (!audioTrack?.enabled) {
        this.updateSpeakingIndicators(container, false);
        return;
      }

      const speaking = this.isSpeaking(analyser, volumeHistory);
      
      if (speakingTimeout) {
        clearTimeout(speakingTimeout);
      }
      
      if (speaking) {
        this.updateSpeakingIndicators(container, true);
      }
      
      speakingTimeout = setTimeout(() => {
        this.updateSpeakingIndicators(container, false);
      }, 500);
    };
  }

  isSpeaking(analyser, volumeHistory) {
    const array = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(array);
    const average = array.reduce((a, b) => a + b) / array.length;
    
    volumeHistory.shift();
    volumeHistory.push(average);
    
    const recentAverage = volumeHistory.reduce((a, b) => a + b) / volumeHistory.length;
    return recentAverage > 15;
  }

  cleanup() {
    this.audioAnalysers.forEach(({ analyser, scriptProcessor, microphone }) => {
      try {
        scriptProcessor.disconnect();
        analyser.disconnect();
        microphone.disconnect();
      } catch (e) {
        console.warn('Error cleaning up audio analysis:', e);
      }
    });
    this.audioAnalysers.clear();
    
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
} 