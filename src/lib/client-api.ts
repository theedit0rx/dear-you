const configuredWorker = process.env.NEXT_PUBLIC_DEAR_YOU_API_URL?.trim().replace(/\/$/, "");

export const usesCloudflareWorker = Boolean(configuredWorker);

export function apiUrl(path: string) {
  if (!configuredWorker) return path;
  return `${configuredWorker}${path.startsWith("/") ? path : `/${path}`}`;
}

export function apiFetch(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (typeof init.body === "string" && !headers.has("content-type")) headers.set("content-type", "application/json");
  return fetch(apiUrl(path), {
    ...init,
    headers,
    credentials: usesCloudflareWorker ? "include" : "same-origin",
  });
}
