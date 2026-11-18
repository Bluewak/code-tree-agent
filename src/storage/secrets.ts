// API 키 보관. chrome.storage.local의 "secrets" 칸에만 둔다.
// 백그라운드만 읽는다. 콘텐츠 스크립트(코드트리 페이지)에는 키를 보내지 않고 "있음/없음"만 알려 준다.

import type { ProviderId } from "./settings";

const SECRETS_KEY = "secrets";
type Secrets = Partial<Record<ProviderId, string>>;

async function load(): Promise<Secrets> {
  const got = await chrome.storage.local.get(SECRETS_KEY);
  const v = got[SECRETS_KEY];
  return v && typeof v === "object" ? (v as Secrets) : {};
}

export async function getKey(provider: ProviderId): Promise<string | null> {
  const k = (await load())[provider];
  return typeof k === "string" && k ? k : null;
}

export async function setKey(provider: ProviderId, key: string | null): Promise<void> {
  const s = await load();
  const trimmed = key?.trim();
  if (trimmed) s[provider] = trimmed;
  else delete s[provider];
  await chrome.storage.local.set({ [SECRETS_KEY]: s });
}
