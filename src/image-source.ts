import type { ExtractRequest } from "./contracts";
import { validatePublicImageUrl } from "./security";

export interface ResolvedImage {
  bytes: Uint8Array;
  mimeType: string;
  dataUri: string;
  originalUrl?: string;
  source: "base64" | "url";
  warnings: string[];
}

const MIME_RE = /^image\/[a-z0-9.+-]+$/i;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}

function decodeBase64(value: string, fallbackMime: string, maxBytes: number): ResolvedImage {
  const trimmed = value.trim();
  const match = /^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i.exec(trimmed);
  const mimeType = match?.[1] || fallbackMime || "image/png";
  const payload = (match?.[2] || trimmed).replace(/\s+/g, "");
  if (!MIME_RE.test(mimeType)) throw new Error("imageMimeType must be an image/* MIME type");
  if (!payload || !/^[a-z0-9+/]*={0,2}$/i.test(payload) || payload.length % 4 === 1) throw new Error("imageBase64 is invalid");
  const estimated = Math.floor(payload.length * 3 / 4);
  if (estimated > maxBytes) throw new Error(`Base64 image exceeds ${maxBytes} bytes`);
  let binary: string;
  try { binary = atob(payload); } catch { throw new Error("imageBase64 is invalid"); }
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  if (!bytes.length || bytes.length > maxBytes) throw new Error(`Base64 image is empty or exceeds ${maxBytes} bytes`);
  return { bytes, mimeType, dataUri: `data:${mimeType};base64,${payload}`, source: "base64", warnings: [] };
}

async function fetchUrlImage(value: string, maxBytes: number, timeoutMs: number): Promise<ResolvedImage> {
  let url = validatePublicImageUrl(value);
  for (let redirect = 0; redirect <= 3; redirect++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try { response = await fetch(url, { redirect: "manual", signal: controller.signal }); }
    finally { clearTimeout(timer); }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location || redirect === 3) throw new Error("Too many or invalid image redirects");
      url = validatePublicImageUrl(new URL(location, url).toString());
      continue;
    }
    if (!response.ok) throw new Error(`Image server returned ${response.status}`);
    const mimeType = response.headers.get("content-type")?.split(";")[0].toLowerCase() || "";
    if (!MIME_RE.test(mimeType)) throw new Error("imageUrl did not return an image content type");
    const length = Number(response.headers.get("content-length") || 0);
    if (length > maxBytes) throw new Error(`Image exceeds ${maxBytes} bytes`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.length || bytes.length > maxBytes) throw new Error(`Image is empty or exceeds ${maxBytes} bytes`);
    return { bytes, mimeType, dataUri: `data:${mimeType};base64,${bytesToBase64(bytes)}`, originalUrl: url.toString(), source: "url", warnings: [] };
  }
  throw new Error("Unable to fetch image");
}

export async function resolveImage(input: ExtractRequest, maxBytes: number, timeoutMs: number): Promise<ResolvedImage> {
  if (input.imageBase64?.trim()) {
    try { return decodeBase64(input.imageBase64, input.imageMimeType || "image/png", maxBytes); }
    catch (error) {
      if (!input.imageUrl) throw error;
      const resolved = await fetchUrlImage(input.imageUrl, maxBytes, timeoutMs);
      resolved.warnings.push(`imageBase64 rejected; used imageUrl fallback: ${error instanceof Error ? error.message : "invalid base64"}`);
      return resolved;
    }
  }
  if (input.imageUrl) return fetchUrlImage(input.imageUrl, maxBytes, timeoutMs);
  throw new Error("Provide imageBase64 or imageUrl");
}

export { decodeBase64 };
