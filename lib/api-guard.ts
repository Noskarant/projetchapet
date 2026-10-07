import { NextResponse } from "next/server";

type Bucket = { count: number; resetAt: number };
type GlobalRateStore = typeof globalThis & { __projetchapetRateBuckets?: Map<string, Bucket> };

const rateBuckets = (globalThis as GlobalRateStore).__projetchapetRateBuckets ?? new Map<string, Bucket>();
(globalThis as GlobalRateStore).__projetchapetRateBuckets = rateBuckets;

export class ApiInputError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "ApiInputError";
    this.status = status;
  }
}

function clientIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")?.trim()
    || "unknown";
}

export function rateLimit(request: Request, route: string, limit: number, windowMs = 60_000) {
  const now = Date.now();
  const key = `${route}:${clientIp(request)}`;
  const current = rateBuckets.get(key);

  if (!current || current.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
  } else if (current.count >= limit) {
    const retryAfter = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
    return NextResponse.json(
      { error: "Trop de demandes. Réessayez dans quelques instants." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  } else {
    current.count += 1;
  }

  if (rateBuckets.size > 2_000) {
    for (const [bucketKey, bucket] of rateBuckets) {
      if (bucket.resetAt <= now) rateBuckets.delete(bucketKey);
    }
    // Bound process memory even when clients keep inventing identifiers.
    while (rateBuckets.size > 2_000) {
      const oldest = rateBuckets.keys().next().value;
      if (oldest === undefined) break;
      rateBuckets.delete(oldest);
    }
  }

  return null;
}

/** Stop reading at the limit, including requests without Content-Length. */
export async function readBodyBytes(request: Request, maxBytes: number): Promise<Uint8Array> {
  const declared = request.headers.get("content-length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > maxBytes)) {
    throw new ApiInputError("Requête trop volumineuse.", 413);
  }
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new ApiInputError("Requête trop volumineuse.", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}

export async function readJsonBody<T>(request: Request, maxBytes: number): Promise<T> {
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > maxBytes) throw new ApiInputError("Requête trop volumineuse.", 413);

  const bytes = await readBodyBytes(request, maxBytes);
  const text = new TextDecoder().decode(bytes);

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiInputError("Corps JSON invalide.");
  }
}

export function requireString(value: unknown, label: string, maxLength: number) {
  if (typeof value !== "string" || !value.trim()) {
    throw new ApiInputError(`${label} est requis.`);
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) throw new ApiInputError(`${label} est trop long.`);
  return normalized;
}

export function optionalString(value: unknown, maxLength: number) {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string") throw new ApiInputError("Valeur texte invalide.");
  const normalized = value.trim();
  if (normalized.length > maxLength) throw new ApiInputError("Valeur texte trop longue.");
  return normalized;
}

export function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}

export function base64ByteLength(value: string) {
  const clean = value.replace(/^data:[^,]+,/, "").replace(/\s/g, "");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean)) throw new ApiInputError("Pièce jointe invalide.");
  return Math.floor((clean.length * 3) / 4) - (clean.endsWith("==") ? 2 : clean.endsWith("=") ? 1 : 0);
}

export function errorResponse(error: unknown, fallback: string) {
  if (error instanceof ApiInputError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  // Les messages des fournisseurs peuvent contenir des détails d'infrastructure.
  // Ils ne doivent jamais être renvoyés tels quels au navigateur.
  return NextResponse.json({ error: fallback }, { status: 500 });
}
