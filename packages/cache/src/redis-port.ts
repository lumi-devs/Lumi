export interface CacheRedis {
  get(key: string): Promise<string | null>;
  setex(key: string, seconds: number, value: string): Promise<unknown>;
  del(...keys: string[]): Promise<unknown>;
  mget(...keys: string[]): Promise<(string | null)[]>;
}
