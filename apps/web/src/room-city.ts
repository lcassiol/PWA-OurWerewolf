export const roomCities = [
  'Toronto',
  'Mississauga',
  'Oakville',
  'Hamilton',
  'Niagara-on-the-Lake',
] as const;

export function cityForRoom(roomCode: string): (typeof roomCities)[number] {
  let hash = 2_166_136_261;
  for (const character of roomCode) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16_777_619);
  }
  return roomCities[(hash >>> 0) % roomCities.length]!;
}
