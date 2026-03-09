/**
 * Generates Discord-style random usernames: Adjective + Noun (e.g. "Arctic Fox", "Swift Wolf")
 */

const ADJECTIVES = [
  'Arctic', 'Cosmic', 'Swift', 'Silent', 'Crimson', 'Golden', 'Shadow', 'Frost',
  'Storm', 'Electric', 'Mystic', 'Wild', 'Solar', 'Lunar', 'Crystal', 'Velvet',
  'Phoenix', 'Thunder', 'Stellar', 'Ember', 'Azure', 'Prismatic', 'Echo', 'Radiant',
]

const NOUNS = [
  'Fox', 'Wolf', 'Hawk', 'Bear', 'Owl', 'Raven', 'Lynx', 'Deer',
  'Otter', 'Panda', 'Falcon', 'Eagle', 'Cobra', 'Tiger', 'Lion', 'Dragon',
]

export function generateCoolUsername(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)]
  return `${adj} ${noun}`
}
