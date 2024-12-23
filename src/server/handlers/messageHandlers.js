import { WebSocket } from 'ws';
import WhisperService from '../services/WhisperService.js';
import TTSService from '../services/TTSService.js';
import TranslationService from '../services/TranslationService.js';

export const messageHandlers = {
  createRoom: (ws, data, { roomService }) => {
    try {
      roomService.validateRoomCreation(data);
      
      const room = roomService.createRoom(
        data.roomName,
        data.userId,
        data.userName,
      );

      room.addParticipant(data.userId, data.userName, ws);
      
      console.log('Created room:', room.id);
      
      // Update connection info after room is created
      ws.connectionInfo = {
        userId: data.userId,
        roomId: room.id,
        observingPin: null
      };
      
      ws.send(JSON.stringify({
        type: 'roomCreated',
        room: room.toJSON()
      }));
    } catch (error) {
      console.error('Error creating room:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: error.message
      }));
    }
  },
  
  joinRoom: (ws, data, { roomService }) => {
    try {
      const room = roomService.getRoomById(data.roomId);
      if (!room) {
        throw new Error('Room not found');
      }

      roomService.addParticipant(data.roomId, data.userId, data.userName, ws);
      
      // Update connection info when joining
      ws.connectionInfo = {
        userId: data.userId,
        roomId: data.roomId,
        observingPin: null
      };

      // Send current transcription state to the joining user
      if (room.transcriptionEnabled) {
        ws.send(JSON.stringify({
          type: 'transcriptionEnabled',
          enabled: true
        }));
      }

      // Notify others in the room
      roomService.broadcastToRoom(data.roomId, {
        type: 'userJoined',
        userId: data.userId,
        userName: data.userName,
        roomId: data.roomId,
        room: room.toJSON()
      }, ws);

    } catch (error) {
      console.error('Error joining room:', error);
      
      // Send specific error for room full
      if (error.message === 'Room is full') {
        ws.send(JSON.stringify({
          type: 'joinError',
          roomId: data.roomId,
          error: 'roomFull',
          message: 'Room has reached maximum participants'
        }));
      } else {
        ws.send(JSON.stringify({
          type: 'joinError',
          roomId: data.roomId,
          message: error.message
        }));
      }
    }
  },
  
  checkRoom: (ws, data, { roomService }) => {
    console.log('Checking room:', data.PIN);
    const room = roomService.findRoomByPIN(data.PIN);
    
    if (room) {
      // Update connection info for observers
      ws.connectionInfo = {
        ...ws.connectionInfo,
        observingPin: data.PIN
      };
      
      roomService.addObserver(data.PIN, ws);
      ws.send(JSON.stringify({
        type: 'roomStatus',
        status: room.toJSON()
      }));
    } else {
      ws.send(JSON.stringify({
        type: 'roomNotFound',
        message: 'Room not found or no longer active'
      }));
    }
  },

  getParticipants: (ws, data, { roomService }) => {
    console.log('Getting participants for room:', data.roomId);
    const room = roomService.getRoomById(data.roomId);
    
    if (room) {
      ws.send(JSON.stringify({
        type: 'participants',
        roomId: data.roomId,
        participants: room.getParticipantsList()
      }));
    }
  },

  trackStateChange: (ws, data, { roomService }) => {
    console.log('Broadcasting track state change:', data);
    const room = roomService.getRoomById(data.roomId);
    
    if (!room) return;

    if (data.targetUserId) {
      // Send to specific user
      const participant = room.participants.get(data.targetUserId);
      if (participant && participant.ws.readyState === WebSocket.OPEN) {
        participant.ws.send(JSON.stringify({
          type: 'trackStateChange',
          userId: data.userId,
          roomId: data.roomId,
          trackKind: data.trackKind,
          enabled: data.enabled
        }));
      }
    } else {
      // Broadcast to all participants except sender
      roomService.broadcastToRoom(data.roomId, {
        type: 'trackStateChange',
        userId: data.userId,
        roomId: data.roomId,
        trackKind: data.trackKind,
        enabled: data.enabled
      }, ws);
    }
  },

  chat: (ws, data, { roomService }) => {
    const room = roomService.getRoomById(data.roomId);
    if (!room) {
      console.log("Ignoring chat message for room:", data.roomId);
      return;
    }

    console.log("WS connection info:", ws.connectionInfo);

    // Check if sender exists in room
    if (!room.participants.has(ws.connectionInfo.userId)) {
      console.log("Sender not found in room:", ws.connectionInfo.userId);
      return;
    }

    // Broadcast the chat message to all participants in the room
    const chatMessage = {
        type: 'chat',
        sender: ws.connectionInfo.userId,
        message: data.message,
        timestamp: data.timestamp
    };

    console.log('Broadcasting chat message:', chatMessage);

    roomService.broadcastToRoom(room.id, chatMessage);
  },

  TTSStatus: (ws, data, { roomService }) => {
    try {
      // Update the connection info to include TTS preference
      ws.connectionInfo = {
        ...ws.connectionInfo,
        ttsEnabled: data.enabled
      };
      
    } catch (error) {
      console.error('Error updating TTS status:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Failed to update TTS status'
      }));
    }
  },

  transcriptionRequest: async (ws, data, { roomService }) => {
    try {
        const room = roomService.getRoomById(ws.connectionInfo.roomId);
        if (!room) {
            throw new Error('Room not found');
        }

        // Only allow transcription if it's enabled for the room
        if (!room.transcriptionEnabled) {
            throw new Error('Transcription is not enabled for this room');
        }

        // Convert base64 to buffer
        const audioBuffer = Buffer.from(data.audioData, 'base64');
        
        // Get transcription in original language
        const language = data.language || 'en';
        const transcription = await WhisperService.transcribe(audioBuffer, language);

        // Prepare response object
        const response = {
            type: 'transcription',
            text: transcription,
            timestamp: data.timestamp,
            originalLanguage: language,
            userId: ws.connectionInfo.userId
        };

        // Translate to English if not already in English
        if (language !== 'en' && language !== null) {
            const translatedText = await TranslationService.translate(transcription, language);
            if (translatedText) {
                response.translatedText = translatedText;
            }
            console.log('Transcription in original language:', transcription);
            console.log('Transcription in translated language:', response.translatedText);
        }

        console.log('Skipping user:', ws.connectionInfo.userId);
        roomService.broadcastToRoom(room.id, response, ws);

        // Generate TTS if enabled for this user
        if (ws.connectionInfo?.ttsEnabled && (language === 'en' || response.translatedText)) {
            const ttsAudio = await TTSService.synthesizeSpeech(
                response.translatedText || transcription,
                'en',
                data.audioData,
                transcription
            );
            if (ttsAudio) {
                response.ttsAudio = Buffer.from(ttsAudio).toString('base64');
            }
        }
        
        // Send response with audio to the user who requested it
        ws.send(JSON.stringify(response));
    } catch (error) {
        console.error({ error }, 'Transcription request failed');
        ws.send(JSON.stringify({
            type: 'error',
            message: error.message
        }));
    }
  },

  transcriptionEnabled: (ws, data, { roomService }) => {
    try {
      const room = roomService.getRoomById(ws.connectionInfo.roomId);
      if (!room) {
        throw new Error('Room not found');
      }

      if(room.transcriptionEnabled === data.enabled) {
        // It's already in the desired state
        return;
      }

      // Update room's transcription status
      room.transcriptionEnabled = data.enabled;

      // Get user's name for the UI message
      const userName = room.participants.get(ws.connectionInfo.userId)?.name || 'Unknown User';

      // Broadcast transcription status change to all participants
      roomService.broadcastToRoom(room.id, {
        type: 'transcriptionEnabled',
        enabled: data.enabled,
        userId: ws.connectionInfo.userId,
        userName: userName
      });
      
    } catch (error) {
      console.error('Error updating transcription status:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: error.message
      }));
    }
  }
};

// Helper function to handle message processing
export function handleMessage(ws, message, services) {
  try {
    const data = JSON.parse(message);
    console.log('Server received:', data);

    // Handle the message if we have a handler for it
    const handler = messageHandlers[data.type];
    if (handler) {
      handler(ws, data, services);
    } else {
      console.warn('No handler for message type:', data.type);
    }
  } catch (error) {
    console.error('Error handling message:', error);
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Internal server error'
    }));
  }
}
