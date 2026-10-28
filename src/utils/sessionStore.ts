import { GameSession, normalizeSession } from '@/types/session';

const STORAGE_KEY = 'anilist:sessions:v1';

export interface SessionStore {
  sessions: Record<string, GameSession>;
  openIds: string[];
  activeId: string | null;
}

export const EMPTY_SESSION_STORE: SessionStore = {
  sessions: {},
  openIds: [],
  activeId: null,
};

export function readSessionStore(): SessionStore {
  if (typeof window === 'undefined') return EMPTY_SESSION_STORE;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_SESSION_STORE;
    const parsed = JSON.parse(raw) as {
      sessions?: unknown;
      openIds?: unknown;
      activeId?: unknown;
    };
    const sessions: Record<string, GameSession> = {};
    if (parsed.sessions && typeof parsed.sessions === 'object') {
      for (const [id, value] of Object.entries(parsed.sessions)) {
        const session = normalizeSession(value, id);
        if (session) sessions[session.id] = session;
      }
    }
    const openIds = Array.isArray(parsed.openIds)
      ? parsed.openIds.filter((id): id is string => typeof id === 'string' && !!sessions[id])
      : [];
    let activeId = typeof parsed.activeId === 'string' ? parsed.activeId : null;
    if (!activeId || !openIds.includes(activeId)) activeId = openIds[0] ?? null;
    return { sessions, openIds, activeId };
  } catch {
    return EMPTY_SESSION_STORE;
  }
}

export function writeSessionStore(store: SessionStore) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}
