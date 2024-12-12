import { uiLogger as log } from '../../utils/logger.js';

export class ParticipantMuteManager {
    constructor() {
        this.mutedParticipants = new Map(); // participantId -> { video: boolean, audio: boolean }
    }

    setupControls(participantId, container) {
        const muteButton = container.querySelector('[data-remote-only]');
        if (!muteButton) return;

        muteButton.classList.remove('hidden');
        muteButton.addEventListener('click', (e) => {
            e.stopPropagation();
            const muted = this.toggleParticipantAudio(participantId, container);
            muteButton.dataset.muted = muted.toString();
            const icon = muteButton.querySelector('.control-icon');
            if (icon) icon.dataset.muted = muted.toString();

            // Update tooltip text
            const muteText = muteButton.querySelector('.block');
            const unmuteText = muteButton.querySelector('.hidden');
            if (muteText && unmuteText) {
                muteText.dataset.muted = muted.toString();
                unmuteText.dataset.muted = muted.toString();
            }
        });
    }

    toggleParticipantAudio(participantId, container) {
        const currentState = this.mutedParticipants.get(participantId)?.audio || false;
        const newState = !currentState;
        
        const video = container.querySelector('video');
        if (video && video.srcObject) {
            const audioTracks = video.srcObject.getAudioTracks();
            audioTracks.forEach(track => {
                track.enabled = !newState; // If muted=true, enabled=false
            });

            this.mutedParticipants.set(participantId, {
                ...this.mutedParticipants.get(participantId),
                audio: newState
            });

            log.debug({ participantId, muted: newState }, 'Toggled participant audio');
            return newState;
        }
        return false;
    }

    isParticipantMuted(participantId) {
        return this.mutedParticipants.get(participantId) || { audio: false, video: false };
    }

    cleanup() {
        this.mutedParticipants.clear();
    }
} 