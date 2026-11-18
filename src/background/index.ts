// 백그라운드(서비스 워커): 메시지 라우터, 단축키, 툴바 아이콘.

import type { Request, ResponseMap, TabMessage } from "../messages";
import { loadSettings, saveSettings } from "../storage/settings";
import { getKey, setKey } from "../storage/secrets";
import { providerInfo } from "../llm/types";
import { createProvider, testProvider } from "../llm/registry";
import type { LlmStatus } from "../messages";

async function llmStatus(): Promise<LlmStatus> {
  const s = await loadSettings();
  const info = providerInfo(s.provider);
  return {
    provider: s.provider,
    providerLabel: info.label,
    model: s.model,
    hasKey: info.needsKey ? !!(await getKey(s.provider)) : true,
    available: info.available,
  };
}

/** 확장 자신의 페이지(설정 페이지)에서 온 메시지인가. 콘텐츠 스크립트는 코드트리 주소를 갖는다 */
function fromExtensionPage(sender: chrome.runtime.MessageSender): boolean {
  return !!sender.url && sender.url.startsWith(chrome.runtime.getURL(""));
}

type Handler<T extends Request["type"]> = (
  req: Extract<Request, { type: T }>,
  sender: chrome.runtime.MessageSender,
) => Promise<ResponseMap[T]>;
type Handlers = { [T in Request["type"]]: Handler<T> };

async function currentShortcut(): Promise<string> {
  const cmds = await chrome.commands.getAll();
  return cmds.find((c) => c.name === "toggle-drawer")?.shortcut || "";
}

const handlers: Handlers = {
  "settings.get": () => loadSettings(),
  "settings.set": (r) => saveSettings(r.patch),
  "llm.status": () => llmStatus(),
  "llm.test": async () => {
    const s = await loadSettings();
    const reply = await testProvider(createProvider(s, await getKey(s.provider)));
    return { message: `연결됨: ${s.model} 응답 "${reply}"` };
  },
  "llm.setKey": async (r, sender) => {
    if (!fromExtensionPage(sender)) throw new Error("키는 확장 설정 페이지에서만 넣을 수 있습니다.");
    await setKey(r.provider, r.key);
    return llmStatus();
  },
  "open.options": async () => {
    await chrome.runtime.openOptionsPage();
    return null;
  },
  "open.shortcuts": async () => {
    await chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
    return null;
  },
  "shortcut.get": async () => ({ shortcut: await currentShortcut() }),
};

chrome.runtime.onMessage.addListener((req: Request, sender, sendResponse) => {
  // 우리 확장에서 온 메시지만 받는다
  if (sender.id !== chrome.runtime.id) return false;
  const handler = handlers[req?.type] as Handler<Request["type"]> | undefined;
  if (!handler) {
    sendResponse({ ok: false, error: `알 수 없는 요청: ${String(req?.type)}` });
    return false;
  }
  handler(req as never, sender)
    .then((data) => sendResponse({ ok: true, data }))
    .catch((e: unknown) => sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }));
  return true; // 비동기 응답
});

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== "toggle-drawer") return;
  const target = tab?.id ?? (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;
  if (target === undefined) return;
  const msg: TabMessage = { type: "drawer.toggle" };
  chrome.tabs.sendMessage(target, msg).catch(() => {
    /* 코드트리 탭이 아니면 받을 콘텐츠 스크립트가 없다 */
  });
});

// 툴바 아이콘: 손잡이 숨기기/보이기
chrome.action.onClicked.addListener(async () => {
  const s = await loadSettings();
  await saveSettings({ handleHidden: !s.handleHidden });
});
