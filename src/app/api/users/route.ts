import { NextRequest, NextResponse } from 'next/server';
import { redis, getUserKey } from '@/utils/redis';
import { CachedUserData, ANILIST_GRAPHQL_ENDPOINT } from '@/utils/sync';

export const dynamic = 'force-dynamic';

const QUICK_CHECK_QUERY = `
query ($username: String) {
  Page(page: 1, perPage: 50) {
    mediaList(userName: $username, type: ANIME, sort: UPDATED_TIME_DESC) {
      updatedAt
    }
  }
}
`;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const usersParam = searchParams.get('users');
  const checkFreshness = searchParams.get('checkFreshness') === 'true';

  if (!usersParam) {
    return NextResponse.json({ users: [] });
  }

  const usernames = usersParam
    .split(',')
    .map(u => u.trim())
    .filter(Boolean);

  if (usernames.length === 0) {
    return NextResponse.json({ users: [] });
  }

  // If Redis is not configured or offline, return empty list so client falls back to direct AniList calls
  if (!redis) {
    return NextResponse.json({ users: [], redisConfigured: false });
  }

  try {
    const keys = usernames.map(getUserKey);
    const results = await redis.mget<CachedUserData[]>(...keys);

    const foundUsers: (CachedUserData & { updatesBehind?: number })[] = [];
    results.forEach((item) => {
      if (item && typeof item === 'object' && item.username) {
        foundUsers.push({ ...item });
      }
    });

    // If requested, quickly check how many updates behind each cached user is
    if (checkFreshness && foundUsers.length > 0) {
      for (const user of foundUsers) {
        if (!user.lastUpdated) {
          user.updatesBehind = 0;
          continue;
        }

        try {
          const res = await fetch(ANILIST_GRAPHQL_ENDPOINT, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
              'User-Agent': 'AniListComparer/1.0',
            },
            body: JSON.stringify({
              query: QUICK_CHECK_QUERY,
              variables: { username: user.username },
            }),
          });

          if (res.ok) {
            const json = await res.json();
            const list = json.data?.Page?.mediaList || [];
            let count = 0;
            for (const entry of list) {
              if (entry.updatedAt > user.lastUpdated) {
                count++;
              } else {
                break;
              }
            }
            user.updatesBehind = count;
          }
        } catch (e) {
          console.warn(`Could not check freshness for ${user.username}:`, e);
        }
      }
    }

    return NextResponse.json({ users: foundUsers, redisConfigured: true });
  } catch (error: any) {
    console.error('Error fetching users from Redis:', error);
    return NextResponse.json({ users: [], error: error.message, redisConfigured: false });
  }
}
