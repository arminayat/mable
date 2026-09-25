import type { KeyProvider } from "./schema";

export function detectKeyProvider(key: string): KeyProvider {
  return key.trim().startsWith("vck_") ? "vercel" : "typesafe";
}
