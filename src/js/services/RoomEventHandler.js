import { roomLogger as log } from '../utils/logger.js';
import { ParticipantVideo } from '../ui/room/ParticipantVideo.js';
import { showError } from '../ui/home/Modal.js';
/**
 * Handles room events and participant state changes.
 * Specifically handles WebSocket events related to room state and participant updates.
 * @class
 */
export class RoomEventHandler {
    /**
     * Creates a new RoomEventHandler instance
     * @param {import('../services/RoomManager.js').RoomManager} roomManager - The room manager instance to handle events for
     * @param {import('../services/RoomUI.js').RoomUI} roomUI - The room UI instance
     */
    constructor(roomManager, roomUI = null) {
        this.roomManager = roomManager;
        this.roomUI = roomUI;
    }

    /**
     * Updates the RoomUI reference
     * @param {import('../services/RoomUI.js').RoomUI} roomUI 
     */
    setRoomUI(roomUI) {
        this.roomUI = roomUI;
    }

    /**
     * Handles when a new user joins the room. Adds them to participants list
     * and sends current track states.
     * 
     * @param {Object} data - Data about the user who joined
     * @param {string} data.roomId - ID of the room being joined
     * @param {string} data.userId - ID of the user who joined
     * @param {string} data.userName - Display name of the user who joined
     * @param {Object} [data.room] - Optional detailed room data
     * @param {Array<{id: string, name: string}>} [data.room.participants] - List of room participants
     */
    handleUserJoined(data) {
        if (data.roomId === this.roomManager.roomId && data.userId !== this.roomManager.userId) {
            log.info({ userId: data.userId, userName: data.userName }, 'New participant joined');
                    
            this._addParticipant(data.userId, data.userName);
            this._sendCurrentTrackStates(data.userId);
            
            // Add system message for user joining
            if (this.roomUI) {
                this.roomUI.handleChatMessage({
                    sender: 'system',
                    message: `${data.userName} joined the room`,
                    timestamp: new Date().toISOString()
                });
            }
        }
    }

    /**
     * Handles when a user leaves the room. Cleans up their video/audio tracks,
     * removes them from participants list, and triggers UI updates.
     * 
     * @param {Object} data - Data about the user who left
     * @param {string} data.roomId - ID of the room the user left
     * @param {string} data.userId - ID of the user who left
     */
    handleUserLeft(data) {
        log.debug({ 
            messageRoomId: data.roomId, 
            currentRoomId: this.roomManager.roomId,
            userId: data.userId 
        }, 'Handling user left event');

        if (data.roomId === this.roomManager.roomId) {
            log.info({ userId: data.userId }, 'Participant left');
            
            // Get user name before removing from participants
            const userName = this.roomManager.participants.get(data.userId)?.name || 'Anonymous';
            
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
                
                // Add system message for user leaving
                if (this.roomUI) {
                    this.roomUI.handleChatMessage({
                        sender: 'system',
                        message: `${userName} left the room`,
                        timestamp: new Date().toISOString()
                    });
                }
                
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

    /**
     * Handles updating the list of participants in the room
     * @param {Object} data - Participant list data
     * @param {Array<{id: string, name: string}>} data.participants - Array of participant objects
     */
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

    /**
     * Handles track state changes (video/audio enabled/disabled) from participants
     * @param {Object} data - Track state change data
     * @param {string} data.roomId - ID of the room
     * @param {string} data.userId - ID of the participant
     * @param {string} data.trackKind - Type of track ('video' or 'audio')
     * @param {boolean} data.enabled - Whether track is enabled
     */
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

    /**
     * Handles room creation event and stores room info in session storage
     * @param {Object} data - Room creation data
     * @param {Object} data.room - Room information
     * @param {string} data.room.PIN - Room PIN
     * @param {string} data.room.name - Room name
     * @param {string} data.room.id - Room ID
     */
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

    /**
     * Adds a participant to the room's participant list
     * @param {string} userId - ID of participant to add
     * @param {string} userName - Name of participant
     * @private
     */
    _addParticipant(userId, userName) {
        if(userId == null) {
            log.error('userId is null');
            return;
        }
        
        if(userName == null) {
            log.error('userName is null');
            return;
        }

        this.roomManager.participants.set(userId, {
            id: userId,
            name: userName
        });
        log.debug({ userId, userName }, 'Participant added to room');
        this.roomManager.onParticipantListUpdate?.();
    }

    /**
     * Updates the UI state of a participant's video/audio tracks
     * @param {Object} data - Track state change data
     * @param {string} data.userId - ID of participant
     * @param {string} data.trackKind - Type of track ('video' or 'audio')
     * @param {boolean} data.enabled - Whether track is enabled
     * @private
     */
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

    /**
     * Sends current video and audio track states to a specific participant
     * @param {string} targetUserId - ID of participant to send states to
     * @private
     */
    _sendCurrentTrackStates(targetUserId) {
        const videoTrack = this.roomManager.webrtc.localStream?.getVideoTracks()[0];
        const audioTrack = this.roomManager.webrtc.localStream?.getAudioTracks()[0];

        // For video, use the track's enabled state
        if (videoTrack) {
            this._sendTrackState('video', videoTrack.enabled, targetUserId);
        } else {
            log.warn('No video track found to send state');
        }

        // For audio, we need to handle the initial state carefully
        // If we're just joining (no VAD yet), we should be unmuted
        // If VAD is initialized, use its state
        const vadManager = this.roomUI?.vadManager;
        const vadInitialized = vadManager?.instances.has('participant-local');
        
        if (audioTrack) {
            // If we're just joining, we're unmuted by default
            const enabled = vadInitialized ? 
                !(vadManager.muted.get('participant-local') ?? false) : 
                true;  // Default to unmuted when joining

            this._sendTrackState('audio', enabled, targetUserId);
            
            log.debug({ 
                vadInitialized,
                enabled,
                trackEnabled: audioTrack.enabled,
                hasVAD: !!vadManager,
                muted: vadManager?.muted.get('participant-local'),
                isJoining: !vadInitialized
            }, 'Sending initial audio state');
        } else {
            log.warn('No audio track found to send state');
        }
    }

    /**
     * Sends a track state change message via WebSocket
     * @param {string} trackKind - Type of track ('video' or 'audio')
     * @param {boolean} enabled - Whether track is enabled
     * @param {string} targetUserId - ID of participant to send state to
     * @private
     */
    _sendTrackState(trackKind, enabled, targetUserId) {
        log.debug({
            trackKind,
            enabled,
            targetUserId,
            hasVAD: !!this.roomUI?.vadManager,
            vadInitialized: this.roomUI?.vadManager?.instances.has('participant-local'),
            isInitialState: !this.roomUI?.vadManager?.instances.has('participant-local')
        }, 'Sending track state');

        this.roomManager.ws.send({
            type: 'trackStateChange',
            userId: this.roomManager.userId,
            roomId: this.roomManager.roomId,
            trackKind,
            enabled,
            targetUserId
        });
    }

    /**
     * Handles incoming messages from WebSocket
     * @param {Object} message - Incoming message
     */
    handleMessage(message) {
        if (!this.roomUI) {
            console.warn('RoomUI not initialized for chat message');
            return;
        }
        
        // If it's our own message, use our username
        const sender = message.sender === this.roomManager.userId ? 
            this.roomManager.userName : 
            this.roomManager.participants.get(message.sender)?.name || 'Anonymous';

        this.roomUI.handleChatMessage({
            sender,
            message: message.message,
            timestamp: message.timestamp
        });
    }

    /**
     * Handles room error event and shows error using the modal
     * @param {Object} data - Room error data
     */
    handleError(data) {
        log.error({ error: data }, 'Room error received');
        
        // Format error message and details
        const errorMessage = data.message || 'An error occurred';
        const errorDetails = data.details || '';
        
        // Determine if the error requires a page refresh
        const shouldRefresh = data.requiresRefresh || 
                             data.type === 'connection_error' || 
                             data.type === 'fatal_error' ||
                             data.code === 'WEBSOCKET_ERROR';
        
        // Show error using the modal
        showError(errorMessage, errorDetails, shouldRefresh);
    }
} 