/**
 * Stores non-sensitive user activity for review, learning, and model improvement.
 * Keyed by userId + username. No passwords, tokens, or PII.
 */

const STORAGE_KEY = 'flint-user-analytics'
const MAX_EVENTS_PER_USER = 500

export interface UserEvent {
  type: string
  data?: Record<string, unknown>
  ts: number
}

export interface UserData {
  userId: string
  username: string
  events: UserEvent[]
  updatedAt: number
}

function loadAll(): Record<string, UserData> {
  try {
    const s = localStorage.getItem(STORAGE_KEY)
    if (!s) return {}
    return JSON.parse(s)
  } catch {
    return {}
  }
}

function saveAll(data: Record<string, UserData>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch {
    /* quota exceeded etc */
  }
}

function ensureUser(data: Record<string, UserData>, userId: string, username: string): UserData {
  const key = userId
  let u = data[key]
  if (!u) {
    u = { userId, username, events: [], updatedAt: Date.now() }
    data[key] = u
  }
  u.username = username // keep username current
  return u
}

/**
 * Record a non-sensitive event for the given user.
 */
export function recordUserEvent(
  userId: string,
  username: string,
  event: { type: string; data?: Record<string, unknown> }
): void {
  const data = loadAll()
  const u = ensureUser(data, userId, username)
  u.events.push({
    type: event.type,
    data: event.data,
    ts: Date.now(),
  })
  if (u.events.length > MAX_EVENTS_PER_USER) {
    u.events = u.events.slice(-MAX_EVENTS_PER_USER)
  }
  u.updatedAt = Date.now()
  saveAll(data)
}

/**
 * Get all stored user data for export/review.
 */
export function getStoredUserData(): UserData[] {
  const data = loadAll()
  return Object.values(data)
}

/**
 * Clear stored data for a user (e.g. on logout) or all.
 */
export function clearUserData(userId?: string): void {
  if (!userId) {
    localStorage.removeItem(STORAGE_KEY)
    return
  }
  const data = loadAll()
  delete data[userId]
  saveAll(data)
}
