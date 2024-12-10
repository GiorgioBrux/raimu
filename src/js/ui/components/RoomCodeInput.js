export class RoomCodeInput {
  constructor(onComplete) {
    this.inputs = Array.from(document.querySelectorAll('[data-room-code-part]'));
    this.onComplete = onComplete;
    this.setupEventListeners();
  }

  setupEventListeners() {
    this.inputs.forEach((input, index) => {
      // Only allow numbers
      input.addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/[^0-9]/g, '');
        
        if (e.target.value.length === 4) {
          if (index < this.inputs.length - 1) {
            this.inputs[index + 1].focus();
          } else {
            // Last input is complete, check if all inputs are filled
            this.checkComplete();
          }
        }
      });

      // Handle backspace
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace') {
          // If current input is empty and we're not on the first input, go back
          if (e.target.value.length === 0 && index > 0) {
            this.inputs[index - 1].focus();
          }
        }
      });

      // Select all text on focus
      input.addEventListener('focus', (e) => {
        setTimeout(() => e.target.select(), 0);
      });

      // Handle paste
      input.addEventListener('paste', (e) => {
        e.preventDefault();
        const pastedText = e.clipboardData.getData('text').replace(/[^0-9]/g, '');
        
        if (pastedText) {
          // Fill all inputs at once without focusing
          const chunks = [];
          for (let i = 0; i < pastedText.length; i += 4) {
            chunks.push(pastedText.slice(i, i + 4));
          }

          // Fill as many inputs as we have chunks
          this.inputs.forEach((input, i) => {
            if (chunks[i]) {
              input.value = chunks[i];
            }
          });

          // Only check complete after all inputs are filled
          this.checkComplete();
        }
      });
    });
  }

  checkComplete() {
    const isComplete = this.inputs.every(input => input.value.length === 4);
    if (isComplete && this.onComplete) {
      this.onComplete(this.getRoomCode());
    }
  }

  getRoomCode() {
    return this.inputs.map(input => input.value).join(''); 
  }

  clear() {
    this.inputs.forEach(input => input.value = '');
    this.inputs[0].focus();
  }
} 