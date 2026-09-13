import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

export type EInvoiceOAuthState = {
  organizationId: string;
  userId: string;
  expiresAt: number;
  nonce: string;
  redirectUri: string;
};

function keyFromSecret(secret: string) {
  if (secret.trim().length < 24) {
    throw new Error("EINVOICE_SECRET doit contenir au moins 24 caractères.");
  }
  return createHash("sha256").update(secret, "utf8").digest();
}

function encode(value: Buffer | string) {
  return Buffer.from(value).toString("base64url");
}

function decode(value: string) {
  return Buffer.from(value, "base64url");
}

export function sealEInvoiceSecret(value: string, secret: string) {
  const key = keyFromSecret(secret);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${encode(iv)}.${encode(tag)}.${encode(ciphertext)}`;
}

export function openEInvoiceSecret(value: string, secret: string) {
  const [version, ivEncoded, tagEncoded, ciphertextEncoded] = value.split(".");
  if (version !== "v1" || !ivEncoded || !tagEncoded || !ciphertextEncoded) {
    throw new Error("Jeton de facturation électronique invalide.");
  }
  const decipher = createDecipheriv("aes-256-gcm", keyFromSecret(secret), decode(ivEncoded));
  decipher.setAuthTag(decode(tagEncoded));
  return Buffer.concat([
    decipher.update(decode(ciphertextEncoded)),
    decipher.final(),
  ]).toString("utf8");
}

export function createEInvoiceOAuthState(
  payload: Omit<EInvoiceOAuthState, "nonce">,
  secret: string,
) {
  const state: EInvoiceOAuthState = { ...payload, nonce: randomBytes(16).toString("hex") };
  const encoded = encode(JSON.stringify(state));
  const signature = createHmac("sha256", keyFromSecret(secret)).update(encoded).digest();
  return `${encoded}.${encode(signature)}`;
}

export function verifyEInvoiceOAuthState(
  state: string,
  secret: string,
  now = Date.now(),
): EInvoiceOAuthState {
  const [encoded, signatureEncoded] = state.split(".");
  if (!encoded || !signatureEncoded) throw new Error("État OAuth invalide.");

  const expected = createHmac("sha256", keyFromSecret(secret)).update(encoded).digest();
  const received = decode(signatureEncoded);
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    throw new Error("Signature OAuth invalide.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(decode(encoded).toString("utf8"));
  } catch {
    throw new Error("État OAuth illisible.");
  }
  if (!parsed || typeof parsed !== "object") throw new Error("État OAuth invalide.");
  const value = parsed as Partial<EInvoiceOAuthState>;
  if (
    typeof value.organizationId !== "string" ||
    typeof value.userId !== "string" ||
    typeof value.expiresAt !== "number" ||
    typeof value.nonce !== "string" ||
    typeof value.redirectUri !== "string"
  ) {
    throw new Error("État OAuth incomplet.");
  }
  if (value.expiresAt < now) throw new Error("La demande de connexion a expiré.");
  if (!/^https?:\/\//i.test(value.redirectUri)) throw new Error("URL OAuth invalide.");
  return value as EInvoiceOAuthState;
}
