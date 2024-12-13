/**
 * @class
 * @classdesc Manages the header of the room UI, updating the room name and PIN display
 * @param {HTMLElement} roomName - The room name element
 * @param {HTMLElement} PIN - The PIN element
 * @param {HTMLElement} copyPinBtn - The copy PIN button element
 */
export class HeaderManager {
    constructor(roomName, PIN, copyPinBtn) {
        this.roomName = roomName;
        this.PIN = PIN;
        this.copyPinBtn = copyPinBtn;

        const roomName_data = sessionStorage.getItem('roomName');
        const pin_data = sessionStorage.getItem('PIN');

        // Add click handler for copying PIN
        if (this.copyPinBtn) {
            this.copyPinBtn.addEventListener('click', () => this._handlePinCopy(pin_data));
        }

        this.updateRoomName(roomName_data);
        this.updatePIN(pin_data);
    }

    /**
     * Updates the room name display
     * @param {string} roomName - The name of the room
     */
    updateRoomName(roomName) {
        if (this.roomName) {
            this.roomName.textContent = roomName || 'Unnamed Room';
        }
    }


    /**
     * Updates the PIN display
     * @param {string} PIN - The PIN of the room
     */
    updatePIN(PIN) {
        if (this.PIN) {
            this.PIN.innerHTML = '';
            
            // Create PIN display groups
            PIN.match(/.{1,4}/g).forEach((group, groupIndex) => {
              const groupDiv = document.createElement('div');
              groupDiv.className = 'flex gap-1 items-center cursor-pointer';
              
              // Create dots display
              const dotsDisplay = document.createElement('div');
              dotsDisplay.className = 'flex gap-1 absolute transition-opacity';
              
              // Create numbers display
              const numbersDisplay = document.createElement('div');
              numbersDisplay.className = 'flex gap-1 opacity-0 transition-opacity';
              
              // Add click/touch handler
              groupDiv.addEventListener('click', () => {
                dotsDisplay.classList.toggle('opacity-0');
                numbersDisplay.classList.toggle('opacity-100');
                // Auto-hide after 2 seconds
                setTimeout(() => {
                  dotsDisplay.classList.remove('opacity-0');
                  numbersDisplay.classList.remove('opacity-100');
                }, 2000);
              });
              
              // Add digits for this group
              [...group].forEach((digit) => {
                // Create dot
                const dot = document.createElement('div');
                dot.className = 'w-2 h-2 rounded-full bg-lime-500';
                dotsDisplay.appendChild(dot);
                
                // Create number
                const number = document.createElement('div');
                number.className = 'w-2 text-xs text-lime-500 font-medium';
                number.textContent = digit;
                numbersDisplay.appendChild(number);
              });
              
              groupDiv.appendChild(dotsDisplay);
              groupDiv.appendChild(numbersDisplay);
              this.PIN.appendChild(groupDiv);
              
              // Add separator after each group except the last
              if (groupIndex < PIN.match(/.{1,4}/g).length - 1) {
                const separator = document.createElement('div');
                separator.className = 'text-lime-400/50';
                separator.textContent = '-';
                this.PIN.appendChild(separator);
              }
            });
          }        
    }

   /**
   * Handles copying the room PIN to clipboard and shows feedback
   * @private
   * @param {string} pin - The PIN to copy
   * @returns {Promise<void>}
   */
  async _handlePinCopy(pin) {
    if (!pin) return;
    
    try {
      await navigator.clipboard.writeText(pin);
      
      // Show success state
      const copyIcon = document.querySelector('.copy-icon');
      const checkIcon = document.querySelector('.check-icon');
      
      if (copyIcon && checkIcon) {
        copyIcon.classList.add('hidden');
        checkIcon.classList.remove('hidden');
        
        // Reset after 2 seconds
        setTimeout(() => {
          copyIcon.classList.remove('hidden');
          checkIcon.classList.add('hidden');
        }, 2000);
      }
    } catch (err) {
      log.error({ error: err }, 'Failed to copy PIN to clipboard');
    }
  }
}