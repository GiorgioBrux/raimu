export class Room {
  constructor(id, name, creatorId, creatorName, PIN, maxParticipants) {
    this.id = id;
    this.name = name;
    this.createdAt = new Date();
    this.createdBy = {
      id: creatorId,
      name: creatorName
    };
    this.participants = new Map();  // Map of userId -> participant data
    this.active = true;
    this.maxParticipants = maxParticipants;
    this.PIN = PIN;
  }

  addParticipant(userId, userName, ws) {
    console.log('Adding participant:', {
      userId,
      userName,
      currentParticipants: this.participants.size
    });
    
    if (this.participants.size >= this.maxParticipants) {
      throw new Error('Room is full');
    }
    
    this.participants.set(userId, { 
      id: userId,
      name: userName, 
      ws,
      joinedAt: new Date()
    });
    
    console.log('Participant added, new count:', this.participants.size);
  }

  removeParticipant(userId) {
    this.participants.delete(userId);
  }

  getParticipantsList() {
    console.log('Getting participants list:', {
      size: this.participants.size,
      participants: Array.from(this.participants.values()).map(p => ({
        id: p.id,
        name: p.name
      }))
    });
    
    return Array.from(this.participants.values()).map(p => ({
      id: p.id,
      name: p.name,
      joinedAt: p.joinedAt
    }));
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      PIN: this.PIN,
      createdAt: this.createdAt,
      createdBy: this.createdBy,
      participantCount: this.participants.size,
      maxParticipants: this.maxParticipants,
      active: this.active,
      participants: this.getParticipantsList()
    };
  }
} 