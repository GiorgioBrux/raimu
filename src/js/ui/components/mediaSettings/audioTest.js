import { uiLogger as log } from '../../../utils/logger.js';

export class AudioTest {
  constructor(elements) {
    this.elements = elements;
    this.testAudioElement = null;
    this.isPlaying = false;
  }

  async playTestSound() {
    try {
      const button = this.elements.testAudio;
      const icon = button.querySelector('[data-test-icon]');
      const spinner = button.querySelector('[data-test-spinner]');
      const speakerSelect = this.elements.speakerSelect;
      
      // If already playing, stop the test
      if (this.isPlaying) {
        this.stopTest();
        return;
      }

      // Start test
      icon.style.opacity = '0';
      spinner.style.opacity = '1';
      button.dataset.testing = 'true';
      speakerSelect.disabled = true;
      this.isPlaying = true;
      
      // Toggle tooltip text
      const activeText = button.querySelector('[data-active-text]');
      const inactiveText = button.querySelector('[data-inactive-text]');
      activeText.classList.remove('hidden');
      inactiveText.classList.add('hidden');
      
      if (!this.testAudioElement) {
        this.testAudioElement = new Audio('/sample.flac');
        this.testAudioElement.loop = true;  // Make it loop
        this.testAudioElement.addEventListener('ended', () => {
          // Only trigger on actual end, not stop
          if (this.isPlaying) {
            this.stopTest();
          }
        });
      }
      
      const deviceId = speakerSelect.value;
      if (deviceId) {
        await this.testAudioElement.setSinkId(deviceId);
      }
      
      await this.testAudioElement.play();
      log.debug({ deviceId }, 'Test sound playing');
    } catch (error) {
      this.stopTest();
      log.error({ error }, 'Failed to play test sound');
    }
  }

  stopTest() {
    const button = this.elements.testAudio;
    const icon = button.querySelector('[data-test-icon]');
    const spinner = button.querySelector('[data-test-spinner]');
    const speakerSelect = this.elements.speakerSelect;

    if (this.testAudioElement) {
      this.testAudioElement.pause();
      this.testAudioElement.currentTime = 0;
    }

    icon.style.opacity = '1';
    spinner.style.opacity = '0';
    button.dataset.testing = 'false';
    speakerSelect.disabled = false;
    this.isPlaying = false;

    // Toggle tooltip text
    const activeText = button.querySelector('[data-active-text]');
    const inactiveText = button.querySelector('[data-inactive-text]');
    activeText.classList.add('hidden');
    inactiveText.classList.remove('hidden');
  }

  destroy() {
    try {
      this.stopTest();
      this.testAudioElement = null;
      log.debug('Audio test cleanup complete');
    } catch (error) {
      log.error({ error }, 'Error during audio test cleanup');
    }
  }
} 