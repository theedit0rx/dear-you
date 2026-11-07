export interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[]; success: boolean; meta?: { changes?: number } }>;
  run<T = Record<string, unknown>>(): Promise<{ success: boolean; meta?: { changes?: number }; results?: T[] }>;
}

export interface D1Database {
  prepare(query: string): D1Statement;
  batch<T = unknown>(statements: D1Statement[]): Promise<Array<{ success: boolean; meta?: { changes?: number }; results?: T[] }>>;
}

export interface R2Object {
  body: ReadableStream<Uint8Array>;
  httpMetadata?: { contentType?: string; cacheControl?: string };
  writeHttpMetadata(headers: Headers): void;
}

export interface R2Bucket {
  put(key: string, value: ArrayBuffer | ArrayBufferView | ReadableStream | string, options?: { httpMetadata?: { contentType?: string; cacheControl?: string }; customMetadata?: Record<string, string> }): Promise<unknown>;
  get(key: string): Promise<R2Object | null>;
  delete(key: string): Promise<void>;
}

export interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;
  APP_ORIGIN: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_PRICE_ID?: string;
  STRIPE_WEBHOOK_SECRET?: string;
}

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  role: "user" | "moderator" | "admin";
  isPremium: boolean;
}
