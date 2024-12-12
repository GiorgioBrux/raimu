import { WebSocket } from 'ws';
import { Room } from '../models/Room.js';
import { generateRoomId, generateRoomPIN } from '../../js/utils/roomUtils.js';

export class RoomService {
  constructor() {
    this.rooms = new Map();
    this.roomObservers = new Map(); // Map of PIN -> Set of WebSocket connections
  }

  createRoom(name, creatorId, creatorName, maxParticipants) {
    const id = generateRoomId();
    const room = new Room(id, name, creatorId, creatorName, generateRoomPIN(), maxParticipants);
    this.rooms.set(id, room);

    return room;
  }

  findRoomByPIN(pin) {
    return [...this.rooms.values()].find(room => room.PIN === pin);
  }

  getRoomById(roomId) {
    return this.rooms.get(roomId);
  }

  addParticipant(roomId, userId, userName, ws) {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new Error('Room not found');
    }

    if (room.participants.size >= room.maxParticipants) {
      throw new Error('Room is full');
    }

    room.addParticipant(userId, userName, ws);
    this.notifyObservers(room);
    return room;
  }

  removeParticipant(roomId, userId) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    room.removeParticipant(userId);
    this.notifyObservers(room);

    // Clean up empty rooms
    if (room.participants.size === 0) {
      room.active = false;
      this.notifyObservers(room);
      this.notifyRoomClosed(room);
      this.rooms.delete(roomId);
      return true; // Room was removed
    }
    return false; // Room still exists
  }

  broadcastToRoom(roomId, message, exclude = null) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    for (const participant of room.participants.values()) {
      if (participant.ws !== exclude && participant.ws.readyState === WebSocket.OPEN) {
        participant.ws.send(JSON.stringify(message));
      }
    }
  }

  // Observer management
  addObserver(pin, ws) {
    if (!this.roomObservers.has(pin)) {
      this.roomObservers.set(pin, new Set());
    }
    this.roomObservers.get(pin).add(ws);
    console.log('Added observer for room:', {
      PIN: pin,
      observerCount: this.roomObservers.get(pin).size
    });
  }

  removeObserver(pin, ws) {
    if (this.roomObservers.has(pin)) {
      this.roomObservers.get(pin).delete(ws);
      if (this.roomObservers.get(pin).size === 0) {
        this.roomObservers.delete(pin);
      }
    }
  }

  notifyObservers(room) {
    if (!this.roomObservers.has(room.PIN)) return;

    const observers = this.roomObservers.get(room.PIN);
    const message = JSON.stringify({
      type: 'roomStatus',
      status: room.toJSON()
    });

    console.log('Notifying room observers:', {
      PIN: room.PIN,
      observerCount: observers.size,
      message
    });

    observers.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    });
  }

  notifyRoomClosed(room) {
    if (!this.roomObservers.has(room.PIN)) {
      console.log('No observers found for room:', room.PIN);
      return;
    }

    const observers = this.roomObservers.get(room.PIN);
    const message = JSON.stringify({
      type: 'roomClosed',
      roomId: room.id,
      PIN: room.PIN
    });

    console.log('Notifying room closed:', {
      PIN: room.PIN,
      observerCount: observers.size,
      message
    });

    observers.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      } else {
        console.log('Observer connection not open:', ws.readyState);
      }
    });

    // Clean up observers for this room
    this.roomObservers.delete(room.PIN);
  }

  validateRoomCreation(data) {
    if (![2,4,8,16,32,64].includes(data.maxParticipants)) {
      throw new Error('Invalid maxParticipants value');
    }

    if (!data.roomName || !data.userId || !data.userName) {
      throw new Error('Missing required fields');
    }

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(data.userId)) {
      throw new Error('Invalid userId');
    }

    if (data.roomName && data.roomName.length > 30) {
      throw new Error('Room name must be less than 30 characters');
    }

    if (data.userName && data.userName.length > 30) {
      throw new Error('User name must be less than 30 characters');
    }
  }
} 