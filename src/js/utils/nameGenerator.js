/**
 * Collection of adjectives for room name generation.
 * @type {string[]}
 */
const adjectives = [
  // Colors
  'azure', 'crimson', 'emerald', 'golden', 'silver',
  // Mood
  'happy', 'peaceful', 'serene', 'tranquil', 'gentle',
  // Nature
  'cosmic', 'stellar', 'lunar', 'solar', 'astral',
  // Quality
  'swift', 'bright', 'clever', 'mystic', 'radiant'
];

/**
 * Collection of nouns for room name generation.
 * @type {string[]}
 */
const nouns = [
  // Celestial
  'star', 'moon', 'sun', 'comet', 'aurora',
  // Mythical
  'phoenix', 'dragon', 'unicorn', 'griffin', 'pegasus',
  // Nature
  'river', 'ocean', 'mountain', 'forest', 'valley',
  // Animals
  'falcon', 'dolphin', 'panther', 'tiger', 'wolf'
];

/**
 * Generates a random room name by combining an adjective and a noun.
 * @returns {string} A randomly generated room name
 */
export function generateRoomName() {
  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  return `${adjective}${noun}`;
} 