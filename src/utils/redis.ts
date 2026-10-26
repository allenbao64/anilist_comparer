import { Redis } from '@upstash/redis';

// Support both standard KV_* variables from Vercel KV and UPSTASH_REDIS_*
const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

// Only instantiate Redis if valid credentials exist (prevents crashes when running locally without env vars)
export const redis: Redis | null = (url && token && url !== '[SENSITIVE]' && token !== '[SENSITIVE]')
  ? new Redis({ url, token })
  : null;

// Prefix all keys to prevent collisions with other apps sharing this Redis DB
export const REDIS_PREFIX = 'anilist:v1';
export const getUserKey = (username: string) => `${REDIS_PREFIX}:user:${username.trim().toLowerCase()}`;
