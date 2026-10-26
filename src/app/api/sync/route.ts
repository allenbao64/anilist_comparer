import { NextRequest, NextResponse } from 'next/server';
import { redis, getUserKey } from '@/utils/redis';
import { syncUserFromAniList, CachedUserData } from '@/utils/sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Allow sufficient time for AniList sync if needed

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { usernames, forceFullRefresh } = body as {
      usernames: string[];
      forceFullRefresh?: boolean;
    };

    if (!Array.isArray(usernames) || usernames.length === 0) {
      return NextResponse.json({ error: 'usernames array is required' }, { status: 400 });
    }

    const updatedUsers: CachedUserData[] = [];
    const errors: Record<string, string> = {};

    for (const rawName of usernames) {
      const username = rawName.trim();
      if (!username) continue;

      try {
        let cachedData: CachedUserData | null = null;

        if (redis && !forceFullRefresh) {
          try {
            cachedData = await redis.get<CachedUserData>(getUserKey(username));
          } catch (e) {
            console.warn(`Could not read cache for ${username} from Redis:`, e);
          }
        }

        // Perform incremental (or full) sync
        const synced = await syncUserFromAniList(username, cachedData);

        // Store back in Redis if available
        if (redis) {
          try {
            // Log payload size for debugging large lists
            const jsonString = JSON.stringify(synced);
            const sizeInKb = (jsonString.length / 1024).toFixed(2);
            console.log(`[Upstash] Saving ${username} payload size: ${sizeInKb} KB`);

            await redis.set(getUserKey(username), synced);
            console.log(`[Upstash] Successfully cached ${username}`);
          } catch (e: any) {
            console.error(`[Upstash Error] Could not write cache for ${username} to Redis:`, e);
            // Record the redis write error explicitly so it shows up in API response
            errors[`${username}_redis`] = `Failed to cache in Redis: ${e.message || e}`;
          }
        }

        updatedUsers.push(synced);
      } catch (err: any) {
        console.error(`Failed to sync user ${username}:`, err);
        errors[username] = err.message || 'Unknown error';
      }
    }

    return NextResponse.json({
      users: updatedUsers,
      errors: Object.keys(errors).length > 0 ? errors : undefined,
      redisConfigured: !!redis,
    });
  } catch (error: any) {
    console.error('Sync route error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
