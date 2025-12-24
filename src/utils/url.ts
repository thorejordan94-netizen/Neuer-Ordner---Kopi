/**
 * URL parsing and normalization utilities
 */

export function parseUrl(url: string): { host: string; pathTokens: string[]; queryKeys: string[] } | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    const pathTokens = parsed.pathname
      .split('/')
      .filter(Boolean)
      .map(token => decodeURIComponent(token).toLowerCase());
    const queryKeys = Array.from(parsed.searchParams.keys());

    return { host, pathTokens, queryKeys };
  } catch {
    return null;
  }
}

export function extractDomain(host: string): string {
  const parts = host.split('.');
  if (parts.length <= 2) return host;
  return parts.slice(-2).join('.');
}

export function getPathPrefix(pathTokens: string[], depth: number): string {
  return pathTokens.slice(0, depth).join('/');
}

export function createSubprojectKey(host: string, pathTokens: string[], depth: number = 2): string {
  const prefix = getPathPrefix(pathTokens, depth);
  return `${host}:${prefix}`;
}

export function isSameOrigin(url1: string, url2: string): boolean {
  try {
    const u1 = new URL(url1);
    const u2 = new URL(url2);
    return u1.origin === u2.origin;
  } catch {
    return false;
  }
}

export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    return parsed.href;
  } catch {
    return url;
  }
}
