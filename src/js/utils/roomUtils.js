import { roomLogger as log } from './logger.js';

/**
 * Utility functions for room management
 */

/**
 * Generates a unique room ID
 * @returns {string} UUID for room identification
 */
export function generateRoomId() {
    try {
        return window?.crypto?.randomUUID() || crypto.randomUUID();
    } catch (error) {
        // Fallback to UUID v4 implementation
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }
}

/**
 * Generates a unique 12-digit room PIN
 * @returns {string} PIN for room identification
 */
export function generateRoomPIN() {
    return Array.from({ length: 12 }, () => Math.floor(Math.random() * 10)).join('');
}

/**
 * Generates a unique user ID
 * @returns {string} UUID for user identification
 */
export function generateUserId() {
    try {
        return window?.crypto?.randomUUID() || crypto.randomUUID();
    } catch (error) {
        // Fallback to UUID v4 implementation
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }
}

/**
 * Gets connection information for a room
 * @param {string} roomId - Room identifier
 * @param {MediaStream} localStream - Local media stream
 * @returns {{roomId: string, localStream: MediaStream}}
 */
export function getConnectionInfo(roomId, localStream) {
    return {
        roomId,
        localStream
    };
}

/**
 * Handles and logs connection errors
 * @param {string} message - Error message prefix
 * @param {Error} error - Error object
 */
export function handleConnectionError(message, error) {
    log.error({ error }, message);
} 