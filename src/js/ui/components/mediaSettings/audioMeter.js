import { uiLogger as log } from '../../../utils/logger.js';

export class AudioMeter {
  constructor(elements) {
    this.elements = elements;
    this.audioContext = null;
    this.audioAnalyser = null;
    this.audioSource = null;
    this.animationFrame = null;
    this.meterSegments = [];

    // Add interaction hint
    this.interactionHint = this.elements.meterFill.parentElement.parentElement.querySelector('.needs-interaction');
  }

  async initAudioContext(stream) {
    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      await this.audioContext.resume();
      
      // Remove interaction hint once initialized
      if (this.interactionHint) {
        this.interactionHint.classList.add('fade-out');
        setTimeout(() => {
          this.interactionHint.remove();
        }, 300); // Match this with CSS transition duration
      }

      this.audioAnalyser = this.audioContext.createAnalyser();
      this.audioAnalyser.fftSize = 2048;
      this.audioAnalyser.minDecibels = -60;
      this.audioAnalyser.maxDecibels = -10;
      this.audioAnalyser.smoothingTimeConstant = 0.5;

      if (stream) {
        this.audioSource = this.audioContext.createMediaStreamSource(stream);
        this.audioSource.connect(this.audioAnalyser);
      }

      this.setupMeterSegments();
      this.startMonitoring();
      
      log.debug('Audio meter initialized successfully');
    } catch (error) {
      log.error({ error }, 'Failed to initialize audio meter');
    }
  }

  setupMeterSegments() {
    const meterContainer = this.elements.meterFill.parentElement;
    meterContainer.innerHTML = '';
    meterContainer.style.display = 'flex';
    meterContainer.style.gap = '2px';
    
    this.meterSegments = [];
    
    for (let i = 0; i < 20; i++) {
      const segment = document.createElement('div');
      segment.style.flex = '1';
      segment.style.height = '100%';
      segment.style.backgroundColor = 'rgb(51, 65, 85)';
      segment.style.transition = 'background-color 100ms';
      
      if (i >= 16) {
        segment.dataset.activeColor = 'rgb(239, 68, 68)';
      } else if (i >= 12) {
        segment.dataset.activeColor = 'rgb(234, 179, 8)';
      } else if (i >= 3) {
        segment.dataset.activeColor = 'rgb(132, 204, 22)';
      } else {
        segment.dataset.activeColor = 'rgb(148, 163, 184)';
      }
      
      this.meterSegments.push(segment);
      meterContainer.appendChild(segment);
    }
  }

  startMonitoring() {
    let frameCount = 0;
    let smoothedLevel = 0;

    const updateMeter = () => {
      try {
        const timeData = new Float32Array(this.audioAnalyser.frequencyBinCount);
        this.audioAnalyser.getFloatTimeDomainData(timeData);
        
        let sum = 0;
        for (const sample of timeData) {
          sum += sample * sample;
        }
        const rms = Math.sqrt(sum / timeData.length);
        const db = 20 * Math.log10(Math.max(rms, 0.000001));
        const targetLevel = Math.max(0, Math.min(100,
          ((db + 60) / 50) * 100
        ));
        
        smoothedLevel = smoothedLevel * 0.85 + targetLevel * 0.15;
        const activeSegments = Math.floor((smoothedLevel / 100) * this.meterSegments.length);
        
        this.meterSegments.forEach((segment, i) => {
          segment.style.backgroundColor = i < activeSegments 
            ? segment.dataset.activeColor 
            : 'rgb(51, 65, 85)';
        });
        
        if (frameCount % 60 === 0) {
          log.debug({ rms, db, targetLevel, smoothedLevel, activeSegments }, 
            'Audio meter values');
        }
        
        frameCount++;
        this.animationFrame = requestAnimationFrame(updateMeter);
      } catch (error) {
        log.error({ error }, 'Error in audio meter update loop');
      }
    };

    updateMeter();
  }

  destroy() {
    try {
      if (this.animationFrame) {
        cancelAnimationFrame(this.animationFrame);
      }
      if (this.audioSource) {
        this.audioSource.disconnect();
      }
      if (this.audioContext && this.audioContext.state !== 'closed') {
        this.audioContext.close();
      }
      this.meterSegments = [];
      log.debug('Audio meter cleanup complete');
    } catch (error) {
      log.error({ error }, 'Error during audio meter cleanup');
    }
  }
} 