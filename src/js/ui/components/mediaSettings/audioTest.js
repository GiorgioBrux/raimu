import { uiLogger as log } from '../../../utils/logger.js';

export class AudioTest {
  constructor(elements) {
    this.elements = elements;
    this.testAudioElement = null;
  }

  async playTestSound() {
    try {
      const button = this.elements.testAudio;
      const icon = button.querySelector('[data-test-icon]');
      const spinner = button.querySelector('[data-test-spinner]');
      
      icon.style.opacity = '0';
      spinner.style.opacity = '1';
      button.dataset.testing = 'true';
      
      if (!this.testAudioElement) {
        this.testAudioElement = new Audio('/sample.flac');
        this.testAudioElement.addEventListener('ended', () => {
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
      const button = this.elements.testAudio;
      const icon = button.querySelector('[data-test-icon]');
      const spinner = button.querySelector('[data-test-spinner]');
      
      icon.style.opacity = '1';
      spinner.style.opacity = '0';
      button.dataset.testing = 'false';
      
      log.error({ error }, 'Failed to play test sound');
    }
  }

  destroy() {
    try {
      if (this.testAudioElement) {
        this.testAudioElement.pause();
        this.testAudioElement = null;
      }
      log.debug('Audio test cleanup complete');
    } catch (error) {
      log.error({ error }, 'Error during audio test cleanup');
    }
  }
} 