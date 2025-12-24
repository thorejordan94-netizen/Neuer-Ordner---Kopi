/**
 * Token extraction and similarity utilities for lightweight semantic matching
 */

import type { TokenCentroid } from '../types.js';

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'been', 'be',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'should',
  'can', 'could', 'may', 'might', 'must', 'that', 'this', 'these', 'those',
]);

export function extractTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter(token => token.length > 2 && !STOP_WORDS.has(token));
}

export function tokenize(input: {
  url?: string;
  title?: string;
  h1?: string;
  meta?: string;
  host?: string;
  pathTokens?: string[];
}): string[] {
  const tokens: string[] = [];

  if (input.host) {
    tokens.push(...input.host.split('.').filter(t => t.length > 2));
  }

  if (input.pathTokens) {
    tokens.push(...input.pathTokens.flatMap(extractTokens));
  }

  if (input.title) {
    tokens.push(...extractTokens(input.title));
  }

  if (input.h1) {
    tokens.push(...extractTokens(input.h1));
  }

  if (input.meta) {
    tokens.push(...extractTokens(input.meta));
  }

  return tokens;
}

export function createCentroid(tokenArrays: string[][], weights?: number[]): TokenCentroid {
  const tokenCounts = new Map<string, number>();
  let totalWeight = 0;

  tokenArrays.forEach((tokens, idx) => {
    const weight = weights?.[idx] ?? 1;
    tokens.forEach(token => {
      tokenCounts.set(token, (tokenCounts.get(token) || 0) + weight);
      totalWeight += weight;
    });
  });

  return { tokens: tokenCounts, totalWeight };
}

export function updateCentroid(centroid: TokenCentroid, tokens: string[], weight: number = 1): TokenCentroid {
  const newTokens = new Map(centroid.tokens);
  tokens.forEach(token => {
    newTokens.set(token, (newTokens.get(token) || 0) + weight);
  });

  return {
    tokens: newTokens,
    totalWeight: centroid.totalWeight + weight * tokens.length,
  };
}

export function cosineSimilarity(centroid: TokenCentroid, tokens: string[]): number {
  if (centroid.tokens.size === 0 || tokens.length === 0) return 0;

  const tokenSet = new Set(tokens);
  let dotProduct = 0;
  let centroidMag = 0;

  for (const [token, weight] of centroid.tokens.entries()) {
    centroidMag += weight * weight;
    if (tokenSet.has(token)) {
      dotProduct += weight;
    }
  }

  const tokenMag = Math.sqrt(tokens.length);
  centroidMag = Math.sqrt(centroidMag);

  if (centroidMag === 0 || tokenMag === 0) return 0;

  return dotProduct / (centroidMag * tokenMag);
}

export function jaccardSimilarity(centroid: TokenCentroid, tokens: string[]): number {
  if (centroid.tokens.size === 0 || tokens.length === 0) return 0;

  const tokenSet = new Set(tokens);
  let intersection = 0;

  for (const token of centroid.tokens.keys()) {
    if (tokenSet.has(token)) {
      intersection++;
    }
  }

  const union = centroid.tokens.size + tokenSet.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function weightedTokenSimilarity(centroid: TokenCentroid, tokens: string[]): number {
  const cosine = cosineSimilarity(centroid, tokens);
  const jaccard = jaccardSimilarity(centroid, tokens);
  return 0.6 * cosine + 0.4 * jaccard;
}

export function hashTokens(tokens: string[]): string {
  return tokens.sort().join('|');
}
