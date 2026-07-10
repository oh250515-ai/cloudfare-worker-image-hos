const PRIVATE_IPV4 = /^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;

export function validatePublicImageUrl(value: string): URL {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("imageUrl must be a valid URL"); }
  if (url.protocol !== "https:") throw new Error("imageUrl must use HTTPS");
  if (url.username || url.password) throw new Error("URL credentials are not allowed");
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host === "::1" || PRIVATE_IPV4.test(host)) throw new Error("Private or local image hosts are not allowed");
  return url;
}

function globMatches(value: string, pattern: string): boolean {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`, "i").test(value);
}

export function isModelAllowed(model: string, configured?: string): boolean {
  if (!/^@cf\/[a-z0-9._-]+\/[a-z0-9._-]+$/i.test(model)) return false;
  if (!configured?.trim()) return true;
  const rules = configured.split(",").map(value => value.trim()).filter(Boolean);
  return rules.includes("*") || rules.some(rule => globMatches(model, rule));
}

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}
