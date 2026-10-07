import { supabase } from "./supabase";

export async function authenticatedAiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (typeof window === "undefined") throw new Error("La dictée nécessite une session navigateur.");
  const url = new URL(input instanceof Request ? input.url : String(input), window.location.href);
  if (url.origin !== window.location.origin) throw new Error("Destination IA non autorisée.");
  const { data, error } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (error || !token) throw new Error("Votre session a expiré. Reconnectez-vous.");
  const headers = new Headers(input instanceof Request ? input.headers : undefined);
  new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
  headers.set("Authorization", `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}
