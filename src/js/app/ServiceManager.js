import { WebSocketService } from '../services/WebSocket.js';
import { RoomManager } from '../services/RoomManager.js';
import { logger } from '../utils/logger.js';
import { AppTypes } from './types.js';

/** @typedef {AppTypes['Services']} Services */
/** @typedef {AppTypes['ServiceKeys']} ServiceKeys */
/** @typedef {AppTypes['ServiceStatus']} ServiceStatus */

/**
 * @class
 * @classdesc Manages core services
 */
export class ServiceManager {
    constructor() {
        /** @type {Services} */
        this.services = {
            ws: null,
            roomManager: null,
            modalManager: null,
            roomUI: null,
            mediaSettings: null
        };
    }

    /**
     * Initializes core services
     * @throws {Error} If services fail to initialize
     */
    async initialize() {
        try {
            const webrtcConfig = {
                iceServers: [
                    // Our STUN server
                    { urls: `stun:${window.location.hostname}:19302` },
                    // Keep Google's STUN servers as fallback
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' }
                ],
                iceCandidatePoolSize: 10
            };

            // Use secure WebSocket if page is served over HTTPS
            const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${wsProtocol}//${window.location.host}/ws`;
            logger.info({ wsUrl }, 'WebSocket URL');
            this.services.ws = new WebSocketService(wsUrl);
            this.services.roomManager = new RoomManager(this.services.ws, webrtcConfig);
            
            logger.info({ webrtcConfig, wsUrl }, 'Core services initialized');
        } catch (error) {
            logger.error({ error }, 'Failed to initialize services');
            throw error;
        }
    }

    /**
     * Cleans up all services
     */
    async cleanup() {
        logger.debug('Starting service cleanup');
        
        const cleanups = [
            // Ensure ordered cleanup
            this.services.ws?.disconnect(),
            this.services.roomUI?.cleanup(),
            this.services.mediaSettings?.destroy(),
            // Add stream cleanup
            async () => {
                const roomManager = this.services.roomManager;
                if (roomManager?.webrtc?.localStream) {
                    roomManager.webrtc.localStream.getTracks().forEach(track => track.stop());
                    logger.debug('Local media tracks stopped');
                }
            }
        ].filter(Boolean);

        try {
            await Promise.all(cleanups);
            // Clear service references
            Object.keys(this.services).forEach(key => {
                this.services[key] = null;
            });
            logger.info('Services cleaned up successfully');
        } catch (error) {
            logger.error({ error }, 'Error during service cleanup');
        }
    }

    /**
     * Gets a service instance
     * @template {ServiceKeys} T
     * @param {T} name - Service name
     * @returns {Services[T]} Service instance
     */
    getService(name) {
        return this.services[name];
    }

    /**
     * Sets a service instance
     * @template {ServiceKeys} T
     * @param {T} name - Service name
     * @param {Services[T]} service - Service instance
     */
    setService(name, service) {
        this.services[name] = service;
    }

    async handleDisconnection() {
        logger.warn('Connection lost, attempting to reconnect');
        
        try {
            // Don't try to reconnect manually, WebSocket service handles this
            if (this.services.ws?.connectionState === 'disconnected') {
                this.services.ws.connect();
            }
            logger.info('Reconnection initiated');
        } catch (error) {
            logger.error({ error }, 'Failed to initiate reconnection');
        }
    }
} 