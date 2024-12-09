import { roomLogger as log } from '../utils/logger.js';
import { ParticipantVideo } from '../ui/components/ParticipantVideo.js';

/**
 * Handles room events and participant state changes.
 * Specifically handles WebSocket events related to room state and participant updates.
 */
export class RoomEventHandler {
    constructor(roomManager) {
        this.roomManager = roomManager;
    }

    // WebSocket event handlers
    handleUserJoined(data) {
        if (data.roomId === this.roomManager.roomId && data.userId !== this.roomManager.userId) {
            log.info({ userId: data.userId }, 'New participant joined');
            this._addParticipant(data.userId, data.userName);
            this._sendCurrentTrackStates(data.userId);
        }
    }

    handleUserLeft(data) {
        if (data.roomId === this.roomManager.roomId) {
            log.info({ userId: data.userId }, 'Participant left');
            this.roomManager.participants.delete(data.userId);
            this.roomManager.webrtc.removeConnection(data.userId);
            this.roomManager.onParticipantListUpdate?.();
        }
    }

    handleParticipantsList(data) {
        log.debug({ participants: data.participants }, 'Updating participants list');
        this.roomManager.participants.clear();
        for (const participantId of data.participants) {
            if (participantId !== this.roomManager.userId) {
                this._addParticipant(participantId, 'Anonymous');
            }
        }
        this.roomManager.onParticipantListUpdate?.();
    }

    handleTrackStateChange(data) {
        if (data.roomId === this.roomManager.roomId && data.userId !== this.roomManager.userId) {
            log.debug({ 
                userId: data.userId, 
                trackKind: data.trackKind, 
                enabled: data.enabled 
            }, 'Received track state change');
            
            this._updateParticipantTrackState(data);
        }
    }

    // Private methods
    _addParticipant(userId, userName) {
        this.roomManager.participants.set(userId, {
            id: userId,
            name: userName
        });
        this.roomManager.onParticipantListUpdate?.();
    }

    _updateParticipantTrackState(data) {
        const container = document.getElementById(`participant-${data.userId}`);
        if (container) {
            if (data.trackKind === 'video') {
                ParticipantVideo.updateMediaState(container, data.enabled, !container.classList.contains('peer-muted'));
            } else if (data.trackKind === 'audio') {
                ParticipantVideo.updateMediaState(container, !container.classList.contains('peer-video-off'), data.enabled);
            }
        } else {
            log.debug('Participant container not found, retrying in 100ms');
            setTimeout(() => this.handleTrackStateChange(data), 100);
        }
    }

    _sendCurrentTrackStates(targetUserId) {
        const videoTrack = this.roomManager.webrtc.localStream?.getVideoTracks()[0];
        const audioTrack = this.roomManager.webrtc.localStream?.getAudioTracks()[0];

        if (videoTrack) {
            this._sendTrackState('video', videoTrack.enabled, targetUserId);
        } else {
            log.warn('No video track found to send state');
        }

        if (audioTrack) {
            this._sendTrackState('audio', audioTrack.enabled, targetUserId);
        } else {
            log.warn('No audio track found to send state');
        }
    }

    _sendTrackState(trackKind, enabled, targetUserId) {
        this.roomManager.ws.send({
            type: 'trackStateChange',
            userId: this.roomManager.userId,
            roomId: this.roomManager.roomId,
            trackKind,
            enabled,
            targetUserId
        });
    }
} 