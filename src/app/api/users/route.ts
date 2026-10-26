import { NextRequest, NextResponse } from 'next/server';
import { redis, getUserKey } from '@/utils/redis';
import { CachedUserData } from '@/utils/sync';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const usersParam = searchParams.get('users');

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

    const foundUsers: CachedUserData[] = [];
    results.forEach((item) => {
      if (item && typeof item === 'object' && item.username) {
        foundUsers.push(item);
      }
    });

    return NextResponse.json({ users: foundUsers, redisConfigured: true });
  } catch (error: any) {
    console.error('Error fetching users from Redis:', error);
    // On Redis error, fail softly so frontend falls back to AniList directly
    return NextResponse.json({ users: [], error: error.message, redisConfigured: false });
  }
}
