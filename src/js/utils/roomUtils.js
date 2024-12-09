import { roomLogger as log } from './logger.js';

/**
 * Utility functions for room management
 */

/**
 * Generates a unique room ID
 * @returns {string} UUID for room identification
 */
export function generateRoomId() {
    return crypto.randomUUID();
}

/**
 * Generates a unique user ID
 * @returns {string} UUID for user identification
 */
export function generateUserId() {
    return crypto.randomUUID();
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