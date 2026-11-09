import type { AnimeStatus } from '@/utils/anilist';

export type SessionSortBy = 'title' | 'averageScore' | 'year' | 'popularity';

export interface PlannedQuestion {
  id: string;
  text: string;
  animeIds: number[];       // IDs of anime associated with this question
  animeTitles: string[];    // Display titles (e.g. "Jujutsu Kaisen (S1-2 + 0)" or individual names)
  unseenUsers: string[];    // Contestants who have NOT seen the anime required for this question
  notes?: string;
}

export interface AnimeGroup {
  id: string;              // unique group identifier (e.g. "grp-...")
  customTitle: string;     // user chosen name e.g. "A Certain Scientific Railgun"
  animeIds: number[];      // the anime IDs merged into this group
}

export interface SessionPlan {
  plannerUsernames?: string[]; // Specific subset of players included in the game planner (if undefined/empty, defaults to all loaded users)
  questions: PlannedQuestion[];
  crossedOffAnimeIds: number[]; // Anime IDs marked as used/crossed off from the candidate pool
  crossedOffGroupIds?: string[]; // AnimeGroup IDs marked as used/crossed off
  groups?: AnimeGroup[];        // User-defined merged anime groups
  titleOverrides: Record<number, string>; // Custom rename for an individual anime ID
}

export interface GameSession {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  usernames: string[];
  fetchStatuses: AnimeStatus[];
  activeStatuses: AnimeStatus[];
  requiredUsers: string[];
  excludedUsers: string[];
  selectedGenres: string[];
  selectedTags: string[];
  selectedFormats: string[];
  minEpisodes: string;
  maxEpisodes: string;
  minYear: string;
  maxYear: string;
  sortBy: SessionSortBy;
  includedAnimeIds?: number[]; // optional alternate summary planner state
  plan?: SessionPlan;
}

export const DEFAULT_FETCH_STATUSES: AnimeStatus[] = ['COMPLETED', 'CURRENT'];

export const SESSION_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidSessionId(id: string): boolean {
  return SESSION_ID_RE.test(id);
}

export function createDefaultPlan(): SessionPlan {
  return {
    plannerUsernames: undefined,
    questions: [],
    crossedOffAnimeIds: [],
    crossedOffGroupIds: [],
    groups: [],
    titleOverrides: {},
  };
}

export function createDefaultSession(overrides: Partial<GameSession> = {}): GameSession {
  const now = Date.now();
  return {
    id: overrides.id ?? crypto.randomUUID(),
    name: overrides.name ?? 'New Game',
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
    usernames: overrides.usernames ?? ['', '', '', ''],
    fetchStatuses: overrides.fetchStatuses ?? [...DEFAULT_FETCH_STATUSES],
    activeStatuses: overrides.activeStatuses ?? [...DEFAULT_FETCH_STATUSES],
    requiredUsers: overrides.requiredUsers ?? [],
    excludedUsers: overrides.excludedUsers ?? [],
    selectedGenres: overrides.selectedGenres ?? [],
    selectedTags: overrides.selectedTags ?? [],
    selectedFormats: overrides.selectedFormats ?? [],
    minEpisodes: overrides.minEpisodes ?? '',
    maxEpisodes: overrides.maxEpisodes ?? '',
    minYear: overrides.minYear ?? '',
    maxYear: overrides.maxYear ?? '',
    sortBy: overrides.sortBy ?? 'title',
    includedAnimeIds: overrides.includedAnimeIds ? [...overrides.includedAnimeIds] : [],
    plan: overrides.plan ?? createDefaultPlan(),
  };
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is string => typeof item === 'string');
}

function normalizePlan(raw: unknown): SessionPlan | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const p = raw as Record<string, unknown>;
  const questions: PlannedQuestion[] = [];
  if (Array.isArray(p.questions)) {
    for (const q of p.questions) {
      if (q && typeof q === 'object') {
        const item = q as Record<string, unknown>;
        questions.push({
          id: typeof item.id === 'string' ? item.id : crypto.randomUUID(),
          text: typeof item.text === 'string' ? item.text : '',
          animeIds: Array.isArray(item.animeIds) ? item.animeIds.filter((n): n is number => typeof n === 'number') : [],
          animeTitles: Array.isArray(item.animeTitles) ? item.animeTitles.filter((s): s is string => typeof s === 'string') : [],
          unseenUsers: Array.isArray(item.unseenUsers) ? item.unseenUsers.filter((s): s is string => typeof s === 'string') : [],
          notes: typeof item.notes === 'string' ? item.notes : undefined,
        });
      }
    }
  }

  const crossedOffAnimeIds = Array.isArray(p.crossedOffAnimeIds)
    ? p.crossedOffAnimeIds.filter((n): n is number => typeof n === 'number')
    : [];

  const crossedOffGroupIds = Array.isArray(p.crossedOffGroupIds)
    ? p.crossedOffGroupIds.filter((s): s is string => typeof s === 'string')
    : [];

  const groups: AnimeGroup[] = [];
  if (Array.isArray(p.groups)) {
    for (const g of p.groups) {
      if (g && typeof g === 'object') {
        const item = g as Record<string, unknown>;
        if (typeof item.id === 'string' && typeof item.customTitle === 'string' && Array.isArray(item.animeIds)) {
          groups.push({
            id: item.id,
            customTitle: item.customTitle,
            animeIds: item.animeIds.filter((n): n is number => typeof n === 'number'),
          });
        }
      }
    }
  }

  const titleOverrides: Record<number, string> = {};
  if (p.titleOverrides && typeof p.titleOverrides === 'object') {
    for (const [key, val] of Object.entries(p.titleOverrides as Record<string, unknown>)) {
      const numKey = Number(key);
      if (!isNaN(numKey) && typeof val === 'string') {
        titleOverrides[numKey] = val;
      }
    }
  }

  const plannerUsernames = asStringArray(p.plannerUsernames);

  return {
    plannerUsernames,
    questions,
    crossedOffAnimeIds,
    crossedOffGroupIds,
    groups,
    titleOverrides,
  };
}

const SORT_VALUES: SessionSortBy[] = ['title', 'averageScore', 'year', 'popularity'];

export function normalizeSession(raw: unknown, fallbackId?: string): GameSession | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  const id = typeof data.id === 'string' ? data.id : fallbackId;
  if (!id || !isValidSessionId(id)) return null;

  const sortBy = SORT_VALUES.includes(data.sortBy as SessionSortBy)
    ? (data.sortBy as SessionSortBy)
    : 'title';

  return createDefaultSession({
    id,
    name: typeof data.name === 'string' && data.name.trim() ? data.name : 'New Game',
    createdAt: typeof data.createdAt === 'number' ? data.createdAt : undefined,
    updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : undefined,
    usernames: asStringArray(data.usernames),
    fetchStatuses: asStringArray(data.fetchStatuses) as AnimeStatus[] | undefined,
    activeStatuses: asStringArray(data.activeStatuses) as AnimeStatus[] | undefined,
    requiredUsers: asStringArray(data.requiredUsers),
    excludedUsers: asStringArray(data.excludedUsers),
    selectedGenres: asStringArray(data.selectedGenres),
    selectedTags: asStringArray(data.selectedTags),
    selectedFormats: asStringArray(data.selectedFormats),
    minEpisodes: typeof data.minEpisodes === 'string' ? data.minEpisodes : undefined,
    maxEpisodes: typeof data.maxEpisodes === 'string' ? data.maxEpisodes : undefined,
    minYear: typeof data.minYear === 'string' ? data.minYear : undefined,
    maxYear: typeof data.maxYear === 'string' ? data.maxYear : undefined,
    sortBy,
    includedAnimeIds: Array.isArray(data.includedAnimeIds)
      ? data.includedAnimeIds.filter((n): n is number => typeof n === 'number')
      : undefined,
    plan: normalizePlan(data.plan),
  });
}
