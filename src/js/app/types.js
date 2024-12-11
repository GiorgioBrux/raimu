import { WebSocketService } from '../services/WebSocket.js';
import { RoomManager } from '../services/RoomManager.js';
import { ModalManager } from '../ui/Modal.js';
import { RoomUI } from '../ui/RoomUI.js';
import { MediaSettings } from '../ui/components/mediaSettings/index.js';

/**
 * @typedef {Object} PageHandler
 * @property {() => Promise<void>} initialize - Initialize page
 * @property {() => Promise<void>} [cleanup] - Cleanup page
 * @property {(error: Error) => void} [handleError] - Handle page-specific errors
 */

/**
 * @typedef {Object} Services
 * @property {WebSocketService|null} ws - WebSocket service
 * @property {RoomManager|null} roomManager - Room management service
 * @property {ModalManager|null} modalManager - Modal UI manager
 * @property {RoomUI|null} roomUI - Room UI manager
 * @property {MediaSettings|null} mediaSettings - Media settings manager
 */

/**
 * @typedef {keyof Services} ServiceKeys
 */

/**
 * @typedef {Object} AppConfig
 * @property {Partial<Services>} [services] - Initial service instances
 * @property {boolean} [debug] - Enable debug mode
 * @property {(error: Error) => void} [errorHandler] - Global error handler
 */

/**
 * @typedef {Object} ServiceStatus
 * @property {boolean} connected - Whether service is connected
 * @property {Error|null} error - Last error if any
 * @property {Date|null} lastConnected - Last successful connection time
 */

export const AppTypes = {
    /** @type {Services} */
    Services: null,
    /** @type {PageHandler} */
    PageHandler: null,
    /** @type {AppConfig} */
    AppConfig: null,
    /** @type {ServiceStatus} */
    ServiceStatus: null
}; 