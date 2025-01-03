export class Room {
  constructor(id, name, creatorId, creatorName, PIN, maxParticipants) {
    this.id = id;
    this.name = name;
    this.createdAt = new Date();
    this.createdBy = {
      id: creatorId,
      name: creatorName,
    };
    this.PIN = PIN;
    this.maxParticipants = maxParticipants;
    this.active = true;
    this.transcriptionEnabled = false;
    this.participants = new Map(); // Map of userId -> { id, name, ws, joinedAt, voiceSample }
    this.observers = new Set();
  }

  /**
   * Adds a participant to the room
   * @param {string} userId - User ID
   * @param {string} userName - User's display name
   * @param {WebSocket} ws - WebSocket connection
   * @param {string} [voiceSample] - Base64 encoded voice sample for TTS
   */
  addParticipant(userId, userName, ws, voiceSample = null) {
    console.log("Adding participant:", {
      userId,
      userName,
      currentParticipants: this.participants.size,
      isSampleProvided: voiceSample !== null,
    });

    if (this.participants.size >= this.maxParticipants) {
      throw new Error("Room is full");
    }

    this.participants.set(userId, {
      id: userId,
      name: userName,
      ws: ws,
      joinedAt: new Date(),
      voiceSample: voiceSample,
    });

    console.log("Participant added, new count:", this.participants.size);
  }

  /**
   * Gets a participant's voice sample
   * @param {string} userId - User ID
   * @returns {string|null} Base64 encoded voice sample or null if not found
   */
  getParticipantVoiceSample(userId) {
    return this.participants.get(userId)?.voiceSample || null;
  }

  /**
   * Gets a list of all participants
   * @returns {Array<{id: string, name: string, joinedAt: Date}>}
   */
  getParticipantsList() {
    console.log("Getting participants list:", {
      size: this.participants.size,
      participants: Array.from(this.participants.values()).map((p) => ({
        id: p.id,
        name: p.name,
      })),
    });

    return Array.from(this.participants.values()).map((p) => ({
      id: p.id,
      name: p.name,
      joinedAt: p.joinedAt,
    }));
  }

  /**
   * Removes a participant from the room
   * @param {string} userId - User ID to remove
   * @returns {boolean} True if participant was removed
   */
  removeParticipant(userId) {
    console.log("Removing participant:", {
      userId,
      currentParticipants: this.participants.size,
    });

    const wasRemoved = this.participants.delete(userId);

    console.log("Participant removed:", {
      userId,
      wasRemoved,
      newParticipantCount: this.participants.size,
    });

    return wasRemoved;
  }

  /**
   * Converts room data to JSON
   * @returns {Object}
   */
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
      transcriptionEnabled: this.transcriptionEnabled,
      participants: this.getParticipantsList(),
    };
  }
}
