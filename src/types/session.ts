import type { AnimeStatus } from '@/utils/anilist';

export type SessionSortBy = 'title' | 'averageScore' | 'year' | 'popularity';

export interface GameSession {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  usernames: string[];
  fetchStatuses: AnimeStatus[];
  activeStatuses: AnimeStatus[];
  requiredUsers: string[];
  selectedGenres: string[];
  selectedTags: string[];
  selectedFormats: string[];
  minEpisodes: string;
  maxEpisodes: string;
  minYear: string;
  maxYear: string;
  sortBy: SessionSortBy;
  includedAnimeIds: number[];
}

export const DEFAULT_FETCH_STATUSES: AnimeStatus[] = ['COMPLETED', 'CURRENT'];

export const SESSION_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidSessionId(id: string): boolean {
  return SESSION_ID_RE.test(id);
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
    selectedGenres: overrides.selectedGenres ?? [],
    selectedTags: overrides.selectedTags ?? [],
    selectedFormats: overrides.selectedFormats ?? [],
    minEpisodes: overrides.minEpisodes ?? '',
    maxEpisodes: overrides.maxEpisodes ?? '',
    minYear: overrides.minYear ?? '',
    maxYear: overrides.maxYear ?? '',
    sortBy: overrides.sortBy ?? 'title',
    includedAnimeIds: overrides.includedAnimeIds ? [...overrides.includedAnimeIds] : [],
  };
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is string => typeof item === 'string');
}

function asNumberArray(value: unknown): number[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is number => typeof item === 'number' && Number.isFinite(item));
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
    selectedGenres: asStringArray(data.selectedGenres),
    selectedTags: asStringArray(data.selectedTags),
    selectedFormats: asStringArray(data.selectedFormats),
    minEpisodes: typeof data.minEpisodes === 'string' ? data.minEpisodes : undefined,
    maxEpisodes: typeof data.maxEpisodes === 'string' ? data.maxEpisodes : undefined,
    minYear: typeof data.minYear === 'string' ? data.minYear : undefined,
    maxYear: typeof data.maxYear === 'string' ? data.maxYear : undefined,
    sortBy,
    includedAnimeIds: asNumberArray(data.includedAnimeIds),
  });
}
