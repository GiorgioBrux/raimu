import { uiLogger as log } from '../../../utils/logger.js';

export class DeviceManager {
  constructor(elements) {
    this.elements = elements;
  }

  async loadDevices() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      
      const cameras = devices.filter(device => device.kind === 'videoinput');
      const microphones = devices.filter(device => device.kind === 'audioinput');
      const speakers = devices.filter(device => device.kind === 'audiooutput');

      this.populateDeviceSelect(this.elements.cameraSelect, cameras);
      this.populateDeviceSelect(this.elements.micSelect, microphones);
      this.populateDeviceSelect(this.elements.speakerSelect, speakers);

      log.debug({ 
        camerasCount: cameras.length,
        microphonesCount: microphones.length,
        speakersCount: speakers.length 
      }, 'Loaded available devices');
    } catch (error) {
      log.error({ error }, 'Failed to load media devices');
    }
  }

  populateDeviceSelect(select, devices) {
    select.innerHTML = devices.map(device => `
      <option value="${device.deviceId}" class="truncate">
        ${device.label || `Device ${devices.indexOf(device) + 1}`}
      </option>
    `).join('');
  }
} 