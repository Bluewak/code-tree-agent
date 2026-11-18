// 설정. chrome.storage.local의 "settings" 한 칸에 둔다. API 키는 여기 두지 않는다(secrets.ts).

export type ProviderId = "claude-api" | "openai-api" | "gemini-api" | "claude-code" | "chatgpt-login";

export interface Settings {
  provider: ProviderId;
  /** 공급자별 모델 이름 */
  model: string;
  side: "left" | "right";
  questionsEnabled: boolean;
  handleHidden: boolean;
}

export const DEFAULT_MODEL: Record<ProviderId, string> = {
  "claude-api": "claude-opus-5-5",
  "openai-api": "",
  "gemini-api": "",
  "claude-code": "",
  "chatgpt-login": "",
};

export const DEFAULT_SETTINGS: Settings = {
  provider: "claude-api",
  model: DEFAULT_MODEL["claude-api"],
  side: "right",
  questionsEnabled: true,
  handleHidden: false,
};

export const SETTINGS_KEY = "settings";

/** 저장된 값이 깨졌거나 예전 모양이어도 기본값으로 메운다 */
export function normalizeSettings(raw: unknown): Settings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Settings>;
  const provider = (["claude-api", "openai-api", "gemini-api", "claude-code", "chatgpt-login"] as const).includes(
    r.provider as ProviderId,
  )
    ? (r.provider as ProviderId)
    : DEFAULT_SETTINGS.provider;
  return {
    provider,
    model: typeof r.model === "string" && r.model ? r.model : DEFAULT_MODEL[provider],
    side: r.side === "left" ? "left" : "right",
    questionsEnabled: typeof r.questionsEnabled === "boolean" ? r.questionsEnabled : true,
    handleHidden: r.handleHidden === true,
  };
}

export async function loadSettings(): Promise<Settings> {
  const got = await chrome.storage.local.get(SETTINGS_KEY);
  return normalizeSettings(got[SETTINGS_KEY]);
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = normalizeSettings({ ...(await loadSettings()), ...patch });
  await chrome.storage.local.set({ [SETTINGS_KEY]: next });
  return next;
}
