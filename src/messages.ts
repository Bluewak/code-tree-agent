// 콘텐츠 스크립트·설정 페이지 → 백그라운드 메시지. 응답은 항상 { ok, data } 또는 { ok:false, error }.

import type { Settings } from "./storage/settings";

export type Request =
  | { type: "settings.get" }
  | { type: "settings.set"; patch: Partial<Settings> }
  | { type: "open.options" }
  | { type: "open.shortcuts" }
  | { type: "shortcut.get" };

export interface ResponseMap {
  "settings.get": Settings;
  "settings.set": Settings;
  "open.options": null;
  "open.shortcuts": null;
  "shortcut.get": { shortcut: string };
}

export type Response<T extends Request["type"]> = { ok: true; data: ResponseMap[T] } | { ok: false; error: string };

/** 백그라운드 → 탭 */
export type TabMessage = { type: "drawer.toggle" };

export async function send<R extends Request>(req: R): Promise<ResponseMap[R["type"]]> {
  const res = (await chrome.runtime.sendMessage(req)) as Response<R["type"]> | undefined;
  if (!res) throw new Error("확장 백그라운드가 응답하지 않습니다. 페이지를 새로고침해 주세요.");
  if (!res.ok) throw new Error(res.error);
  return res.data;
}
