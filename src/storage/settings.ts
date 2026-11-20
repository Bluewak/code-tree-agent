// 설정. chrome.storage.local의 "settings" 한 칸에 둔다. API 키는 여기 두지 않는다(secrets.ts).

export type ProviderId = "claude-api" | "openai-api" | "gemini-api" | "claude-code" | "chatgpt-login";

export interface Settings {
  provider: ProviderId;
  /** 공급자별 모델 이름 */
  model: string;
  side: "left" | "right";
  questionsEnabled: boolean;
  handleHidden: boolean;
  /** "왜 이 칸을 쓰나요?"를 이미 본 질문 번호 (처음 볼 때만 펼쳐 보여 준다) */
  whySeen: number[];
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
  whySeen: [],
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
    whySeen: Array.isArray(r.whySeen) ? r.whySeen.filter((n): n is number => Number.isInteger(n) && n >= 1 && n <= 6) : [],
  };
}

export async function loadSettings(): Promise<Settings> {
  const got = await chrome.storage.local.get(SETTINGS_KEY);
  return normalizeSettings(got[SETTINGS_KEY]);
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const cur = await loadSettings();
  const merged = { ...cur, ...patch };
  // 연결 방식을 바꾸면 모델도 그 방식의 기본값으로
  if (patch.provider && patch.provider !== cur.provider && !patch.model) merged.model = DEFAULT_MODEL[patch.provider];
  const next = normalizeSettings(merged);
  await chrome.storage.local.set({ [SETTINGS_KEY]: next });
  return next;
}
