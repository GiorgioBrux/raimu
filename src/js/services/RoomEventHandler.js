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
            log.info({ userId: data.userId, userName: data.userName }, 'New participant joined');
            
            // If we have detailed room data, use it
            if (data.room?.participants) {
                const participant = data.room.participants.find(p => p.id === data.userId);
                if (participant) {
                    this._addParticipant(participant.id, participant.name);
                    this._sendCurrentTrackStates(participant.id);
                    return;
                }
            }
            
            // Fallback to basic data
            this._addParticipant(data.userId, data.userName);
            this._sendCurrentTrackStates(data.userId);
        }
    }

    handleUserLeft(data) {
        log.debug({ 
            messageRoomId: data.roomId, 
            currentRoomId: this.roomManager.roomId,
            userId: data.userId 
        }, 'Handling user left event');

        if (data.roomId === this.roomManager.roomId) {
            log.info({ userId: data.userId }, 'Participant left');
            
            try {
                // First stop any track state updates
                const container = document.getElementById(`participant-${data.userId}`);
                log.debug({ 
                    userId: data.userId,
                    containerFound: !!container 
                }, 'Looking for participant container');

                if (container) {
                    log.debug({ userId: data.userId }, 'Found container, stopping tracks');
                    const video = container.querySelector('video');
                    if (video && video.srcObject) {
                        video.srcObject.getTracks().forEach(track => {
                            track.stop();
                            track.enabled = false;
                        });
                        video.srcObject = null;
                    }
                } else {
                    log.warn({ userId: data.userId }, 'Container not found for participant');
                }
                
                // Remove from participants list
                log.debug({ userId: data.userId }, 'Removing from participants list');
                this.roomManager.participants.delete(data.userId);
                
                // Trigger UI update directly
                log.debug({ 
                    userId: data.userId,
                    hasCallback: !!this.roomManager.onParticipantLeft 
                }, 'Checking for participant left callback');

                if (this.roomManager.onParticipantLeft) {
                    this.roomManager.onParticipantLeft(data.userId);
                } else {
                    log.warn({ userId: data.userId }, 'No onParticipantLeft callback registered');
                }
                
                // Clean up WebRTC connection last
                log.debug({ userId: data.userId }, 'Cleaning up WebRTC connection');
                this.roomManager.webrtc.removeConnection(data.userId);
                
                log.debug({ userId: data.userId }, 'Participant removal completed');
            } catch (error) {
                log.error({ error, userId: data.userId }, 'Error during participant removal');
            }
        } else {
            log.debug({ 
                messageRoomId: data.roomId, 
                currentRoomId: this.roomManager.roomId 
            }, 'Ignoring user left event - room ID mismatch');
        }
    }

    handleParticipantsList(data) {
        log.debug({ participants: data.participants }, 'Updating participants list');
        this.roomManager.participants.clear();
        
        // Handle participants as objects with id and name
        for (const participant of data.participants) {
            if (typeof participant === 'object' && participant.id !== this.roomManager.userId) {
                this._addParticipant(participant.id, participant.name);
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

    handleRoomCreated(data) {
        log.info({ room: data.room }, 'Got info about created room');
        sessionStorage.setItem('PIN', data.room.PIN);
        sessionStorage.setItem('roomName', data.room.name);
        sessionStorage.setItem('roomId', data.room.id);
        
        log.debug({ 
            newRoomId: data.room.id,
            storedRoomId: sessionStorage.getItem('roomId'),
        }, 'Room ID set in sessionStorage');
        
        
        window.appRouter.navigate(`/room/${data.room.id}`);
    }

    // Private methods
    _addParticipant(userId, userName) {
        this.roomManager.participants.set(userId, {
            id: userId,
            name: userName || 'Anonymous'  // Fallback to 'Anonymous' if name is null
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