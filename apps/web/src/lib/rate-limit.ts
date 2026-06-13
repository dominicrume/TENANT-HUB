import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Local in-memory fallback for development or when Redis is not configured
const localCache = new Map<string, number>();
const fallbackLimiter = (limit: number, windowSecs: number) => {
  return {
    limit: async (identifier: string) => {
      const now = Date.now();
      const key = `${identifier}-${Math.floor(now / (windowSecs * 1000))}`;
      const count = (localCache.get(key) || 0) + 1;
      localCache.set(key, count);
      // Prune old entries occasionally to prevent memory leaks in long-running processes
      if (Math.random() < 0.01) {
        const threshold = now - (windowSecs * 1000 * 2);
        for (const k of localCache.keys()) {
          const tsMatch = k.match(/-(\d+)$/);
          if (tsMatch && tsMatch[1] && parseInt(tsMatch[1]) * windowSecs * 1000 < threshold) {
            localCache.delete(k);
          }
        }
      }
      return { success: count <= limit, limit, remaining: Math.max(0, limit - count), reset: now + windowSecs * 1000 };
    }
  };
};

const hasRedis = !!process.env.UPSTASH_REDIS_REST_URL;
const redis = hasRedis ? Redis.fromEnv() : null;

// /api/auth/* max 10/min
export const authRateLimit = hasRedis 
  ? new Ratelimit({ redis: redis!, limiter: Ratelimit.slidingWindow(10, "1 m"), analytics: true })
  : fallbackLimiter(10, 60);

// /api/ai/* max 20/min
export const aiRateLimit = hasRedis 
  ? new Ratelimit({ redis: redis!, limiter: Ratelimit.slidingWindow(20, "1 m"), analytics: true })
  : fallbackLimiter(20, 60);

// all others max 200/min
export const genericRateLimit = hasRedis 
  ? new Ratelimit({ redis: redis!, limiter: Ratelimit.slidingWindow(200, "1 m"), analytics: true })
  : fallbackLimiter(200, 60);
