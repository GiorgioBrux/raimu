import { uiLogger as log } from '../../../utils/logger.js';

/**
 * Manages media streams for transcription and TTS
 */
export class StreamManager {
    constructor(webrtc = null) {
        this.webrtc = webrtc;
        this.currentStream = null;
    }

    /**
     * Updates stream states
     * @private
     */
    _updateStreamStates(stream, isVideoEnabled, isAudioMuted) {
        log.debug({ 
            isVideoEnabled, 
            isAudioMuted,
            streamTracks: stream.getTracks().map(t => ({
                kind: t.kind,
                enabled: t.enabled,
                id: t.id
            }))
        }, 'Updating stream states');

        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) {
            videoTrack.enabled = isVideoEnabled;
        }

        const audioTrack = stream.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = !isAudioMuted;
            log.debug({ 
                audioTrackId: audioTrack.id,
                enabled: audioTrack.enabled,
                shouldBeMuted: isAudioMuted 
            }, 'Updated audio track state');
        }
    }

    /**
     * Creates a new media stream with current video constraints
     */
    async createNewStream(videoTrack) {
        const videoConstraints = videoTrack?.getConstraints() || { width: 1280, height: 720 };
        return await navigator.mediaDevices.getUserMedia({ 
            audio: true, 
            video: videoConstraints
        });
    }

    /**
     * Updates the WebRTC stream
     */
    async updateWebRTCStream(stream, currentMuteState = false) {
        // Temporarily disable track state change handler
        const originalHandler = this.webrtc.onTrackStateChange;
        this.webrtc.onTrackStateChange = null;
        
        try {
            await this.webrtc.updateLocalStream(stream);
            // Ensure the stream respects mute state
            const audioTrack = stream.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !currentMuteState;
            }
        } finally {
            this.webrtc.onTrackStateChange = originalHandler;
        }
    }

    /**
     * Sets up track state change handler
     */
    setupTrackStateHandler(onMuteStateChange) {
        const originalCallback = this.webrtc.onTrackStateChange;
        this.webrtc.onTrackStateChange = (peerId, kind, enabled, roomId) => {
            // Only handle local audio track changes
            if (peerId === this.webrtc.peer?.id && kind === 'audio') {
                onMuteStateChange(!enabled);
            }
            // Call original callback if it exists
            originalCallback?.(peerId, kind, enabled, roomId);
        };
    }

    /**
     * Updates the current stream and WebRTC instance
     */
    setWebRTC(webrtc) {
        this.webrtc = webrtc;
    }

    /**
     * Sets the current stream
     */
    setCurrentStream(stream) {
        this.currentStream = stream;
    }

    /**
     * Gets the current stream
     */
    getCurrentStream() {
        return this.currentStream;
    }

    /**
     * Checks if audio is currently muted
     */
    isAudioMuted() {
        if (!this.webrtc?.localStream) return false;
        const audioTrack = this.webrtc.localStream.getAudioTracks()[0];
        return audioTrack ? !audioTrack.enabled : false;
    }
} 