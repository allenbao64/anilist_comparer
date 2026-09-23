const ANILIST_API = 'https://graphql.anilist.co';

export type AnimeStatus = 'COMPLETED' | 'CURRENT' | 'PLANNING' | 'DROPPED' | 'PAUSED' | 'REPEATING';

export interface AnimeEntry {
  id: number;
  title: string;
  genres: string[];
  tags: string[];
}

export interface UserStatusData {
  username: string;
  statusData: Record<AnimeStatus, AnimeEntry[]>;
}

const QUERY = `
query ($username: String, $page: Int, $status: MediaListStatus) {
  Page(page: $page, perPage: 50) {
    pageInfo {
      hasNextPage
    }
    mediaList(userName: $username, type: ANIME, status: $status) {
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
      }
    }
  }
}
`;

export async function fetchGenres(): Promise<string[]> {
  const query = `query { GenreCollection }`;
  const response = await fetch(ANILIST_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const data = await response.json();
  return data.data.GenreCollection;
}

export async function fetchTags(): Promise<string[]> {
  const query = `query { MediaTagCollection { name } }`;
  const response = await fetch(ANILIST_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const data = await response.json();
  return data.data.MediaTagCollection.map((tag: any) => tag.name);
}

export type RetryCallback = (message: string, waitTimeSeconds?: number) => void;

async function fetchWithRetry(
  url: string, 
  options: any, 
  retries = 10, 
  onRetry?: RetryCallback
): Promise<any> {
  try {
    const response = await fetch(url, options);
    
    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      const waitTime = retryAfter ? parseInt(retryAfter) : 15;
      if (retries > 0) {
        if (onRetry) onRetry(`Rate limit hit! Waiting ${waitTime}s...`, waitTime);
        await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
        return fetchWithRetry(url, options, retries - 1, onRetry);
      }
      throw new Error('RATE_LIMIT: Too many requests. Please wait and try again.');
    }
    
    if (!response.ok) {
      const error = await response.json();
      const message = error.errors?.[0]?.message || 'AniList API error';
      if (message.includes('Not Found')) {
        throw new Error(`FATAL: User not found`);
      }
      throw new Error(`API_ERROR: ${message}`);
    }
    
    return response.json();
  } catch (error: any) {
    if (error.message?.includes('FATAL') || error.message?.includes('RATE_LIMIT')) {
      throw error;
    }
    if (retries > 0) {
      const wait = 2000;
      if (onRetry) onRetry(`Connection error. Retrying in 2s...`, 2);
      await new Promise(resolve => setTimeout(resolve, wait));
      return fetchWithRetry(url, options, retries - 1, onRetry);
    }
    throw new Error(`NETWORK_ERROR: ${error.message}`);
  }
}

export async function fetchAllUserData(
  username: string, 
  statuses: AnimeStatus[],
  onProgress?: RetryCallback
): Promise<Record<AnimeStatus, AnimeEntry[]>> {
  const result: Partial<Record<AnimeStatus, AnimeEntry[]>> = {};
  
  for (const status of statuses) {
    let allEntries: AnimeEntry[] = [];
    let hasNextPage = true;
    let page = 1;
    
    while (hasNextPage) {
      if (onProgress) onProgress(`Loading ${username}'s ${status} list (Page ${page})...`);
      
      const variables = {
        username,
        page,
        status
      };
      
      try {
        const data = await fetchWithRetry(ANILIST_API, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify({
            query: QUERY,
            variables,
          }),
        }, 5, onProgress);
        
        if (!data?.data?.Page) {
          throw new Error(`Invalid response format for ${username}`);
        }

        const pageData = data.data.Page;
        
        if (!pageData.mediaList) {
          hasNextPage = false;
          continue;
        }

        const entries = pageData.mediaList.map((item: any) => ({
          id: item.media.id,
          title: item.media.title.english || item.media.title.romaji,
          genres: item.media.genres || [],
          tags: item.media.tags?.map((t: any) => t.name) || [],
        }));
        
        allEntries = [...allEntries, ...entries];
        hasNextPage = pageData.pageInfo.hasNextPage;
        page++;
        
        if (hasNextPage) {
          await new Promise(resolve => setTimeout(resolve, 400));
        }
      } catch (err: any) {
        throw new Error(`${username} (${status}): ${err.message}`);
      }
    }
    result[status] = allEntries;
  }
  
  return result as Record<AnimeStatus, AnimeEntry[]>;
}
