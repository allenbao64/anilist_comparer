import { AnimeEntry, AnimeStatus, UserStatusData } from './anilist';

export const ANILIST_GRAPHQL_ENDPOINT = 'https://graphql.anilist.co';

export interface CachedUserData {
  username: string;
  lastUpdated: number; // Unix timestamp in seconds
  statusData: Record<AnimeStatus, AnimeEntry[]>;
}

const SYNC_QUERY = `
query ($username: String, $page: Int) {
  Page(page: $page, perPage: 50) {
    pageInfo {
      hasNextPage
    }
    mediaList(userName: $username, type: ANIME, sort: UPDATED_TIME_DESC) {
      status
      score
      progress
      updatedAt
      media {
        id
        title {
          english
          romaji
        }
        genres
        tags {
          name
        }
        startDate {
          year
        }
        seasonYear
        episodes
        format
        averageScore
        popularity
      }
    }
  }
}
`;
const BATCH_SYNC_QUERY = `
query ($username: String, $p1: Int, $p2: Int, $p3: Int) {
  page1: Page(page: $p1, perPage: 50) {
    pageInfo {
      hasNextPage
    }
    mediaList(userName: $username, type: ANIME, sort: UPDATED_TIME_DESC) {
      status
      score
      progress
      updatedAt
      media {
        id
        title {
          english
          romaji
        }
        genres
        tags {
          name
        }
        startDate {
          year
        }
        seasonYear
        episodes
        format
        averageScore
        popularity
      }
    }
  }
  page2: Page(page: $p2, perPage: 50) {
    pageInfo {
      hasNextPage
    }
    mediaList(userName: $username, type: ANIME, sort: UPDATED_TIME_DESC) {
      status
      score
      progress
      updatedAt
      media {
        id
        title {
          english
          romaji
        }
        genres
        tags {
          name
        }
        startDate {
          year
        }
        seasonYear
        episodes
        format
        averageScore
        popularity
      }
    }
  }
  page3: Page(page: $p3, perPage: 50) {
    pageInfo {
      hasNextPage
    }
    mediaList(userName: $username, type: ANIME, sort: UPDATED_TIME_DESC) {
      status
      score
      progress
      updatedAt
      media {
        id
        title {
          english
          romaji
        }
        genres
        tags {
          name
        }
        startDate {
          year
        }
        seasonYear
        episodes
        format
        averageScore
        popularity
      }
    }
  }
}
`;

/**
 * Perform incremental sync from AniList for a single user.
 * If cachedData is provided, stops pagination once items are older than cachedData.lastUpdated.
 */
export async function syncUserFromAniList(
  username: string,
  cachedData: CachedUserData | null,
  statusesToTrack: AnimeStatus[] = ['COMPLETED', 'CURRENT', 'PLANNING', 'DROPPED', 'PAUSED', 'REPEATING']
): Promise<CachedUserData> {
  const lastSyncTimestamp = cachedData?.lastUpdated ?? 0;
  const now = Math.floor(Date.now() / 1000);

  // Map of status -> Map of animeId -> AnimeEntry
  const existingMap: Record<AnimeStatus, Map<number, AnimeEntry>> = {
    COMPLETED: new Map(),
    CURRENT: new Map(),
    PLANNING: new Map(),
    DROPPED: new Map(),
    PAUSED: new Map(),
    REPEATING: new Map(),
  };

  // Populate from cache if we have it
  if (cachedData?.statusData) {
    for (const [status, entries] of Object.entries(cachedData.statusData)) {
      const statusKey = status as AnimeStatus;
      if (existingMap[statusKey]) {
        for (const entry of entries) {
          existingMap[statusKey].set(entry.id, entry);
        }
      }
    }
  }

  let hasNextPage = true;

  if (lastSyncTimestamp === 0) {
      // Initial fetch (No Cache): Fetch 3 pages per HTTP request to finish in ~15s
      let batchStartPage = 1;
      let keepGoing = true;

      while (keepGoing) {
        const res = await fetch(ANILIST_GRAPHQL_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            query: BATCH_SYNC_QUERY,
            variables: {
              username,
              p1: batchStartPage,
              p2: batchStartPage + 1,
              p3: batchStartPage + 2,
            },
          }),
        });

        if (res.status === 429) {
          const retryAfter = parseInt(res.headers.get('Retry-After') || '10', 10);
          await new Promise(r => setTimeout(r, retryAfter * 1000));
          continue;
        }

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.errors?.[0]?.message || `AniList returned status ${res.status}`);
        }

        const json = await res.json();
        const data = json.data || {};
        const pages = [data.page1, data.page2, data.page3];

        for (const pageData of pages) {
          if (!pageData?.mediaList || pageData.mediaList.length === 0) {
            keepGoing = false;
            break;
          }

          for (const item of pageData.mediaList) {
            const status = item.status as AnimeStatus;
            if (!existingMap[status]) continue;

            const animeEntry: AnimeEntry = {
              id: item.media.id,
              title: item.media.title.english || item.media.title.romaji,
              genres: item.media.genres || [],
              tags: item.media.tags?.map((t: any) => t.name) || [],
              year: item.media.startDate?.year ?? item.media.seasonYear ?? null,
              episodes: item.media.episodes ?? null,
              format: item.media.format ?? null,
              averageScore: item.media.averageScore ?? null,
              popularity: item.media.popularity ?? null,
              userScore: typeof item.score === 'number' && item.score > 0 ? item.score : null,
              userProgress: typeof item.progress === 'number' ? item.progress : null,
            };

            for (const [st, map] of Object.entries(existingMap)) {
              if (st !== status) map.delete(animeEntry.id);
            }
            existingMap[status].set(animeEntry.id, animeEntry);
          }

          if (!pageData.pageInfo?.hasNextPage) {
            keepGoing = false;
            break;
          }
        }

        batchStartPage += 3;
        if (keepGoing) {
          await new Promise(r => setTimeout(r, 250));
        }
      }
    } else {
      // Incremental Sync (Existing Cache): Page through normally 1 page at a time
      let hasNextPage = true;
      let page = 1;
      let hitOlderThanCache = false;

      while (hasNextPage && !hitOlderThanCache) {
        const res = await fetch(ANILIST_GRAPHQL_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            query: SYNC_QUERY,
            variables: { username, page },
          }),
        });

        if (res.status === 429) {
          const retryAfter = parseInt(res.headers.get('Retry-After') || '10', 10);
          await new Promise(r => setTimeout(r, retryAfter * 1000));
          continue;
        }

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.errors?.[0]?.message || `AniList returned status ${res.status}`);
        }

        const json = await res.json();
        const pageData = json.data?.Page;
        if (!pageData?.mediaList) break;

        for (const item of pageData.mediaList) {
          const itemUpdatedAt = item.updatedAt as number;

          if (lastSyncTimestamp > 0 && itemUpdatedAt <= lastSyncTimestamp) {
            hitOlderThanCache = true;
            break;
          }

          const status = item.status as AnimeStatus;
          if (!existingMap[status]) continue;

          const animeEntry: AnimeEntry = {
            id: item.media.id,
            title: item.media.title.english || item.media.title.romaji,
            genres: item.media.genres || [],
            tags: item.media.tags?.map((t: any) => t.name) || [],
            year: item.media.startDate?.year ?? item.media.seasonYear ?? null,
            episodes: item.media.episodes ?? null,
            format: item.media.format ?? null,
            averageScore: item.media.averageScore ?? null,
            popularity: item.media.popularity ?? null,
            userScore: typeof item.score === 'number' && item.score > 0 ? item.score : null,
            userProgress: typeof item.progress === 'number' ? item.progress : null,
          };

          for (const [st, map] of Object.entries(existingMap)) {
            if (st !== status) map.delete(animeEntry.id);
          }
          existingMap[status].set(animeEntry.id, animeEntry);
        }

        hasNextPage = pageData.pageInfo?.hasNextPage ?? false;
        page++;

        if (hasNextPage && !hitOlderThanCache) {
          await new Promise(r => setTimeout(r, 200));
        }
      }
    }

  // Convert maps back to array records
  const resultStatusData: Record<AnimeStatus, AnimeEntry[]> = {
    COMPLETED: Array.from(existingMap.COMPLETED.values()),
    CURRENT: Array.from(existingMap.CURRENT.values()),
    PLANNING: Array.from(existingMap.PLANNING.values()),
    DROPPED: Array.from(existingMap.DROPPED.values()),
    PAUSED: Array.from(existingMap.PAUSED.values()),
    REPEATING: Array.from(existingMap.REPEATING.values()),
  };

  return {
    username,
    lastUpdated: now,
    statusData: resultStatusData,
  };
}
