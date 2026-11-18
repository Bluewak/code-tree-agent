// 페이지(메인 월드)에서 도는 예비 읽기 스크립트.
// ide-storage를 못 읽을 때만 불린다. .monaco-editor[data-uri] 요소의 React fiber를 따라 올라가며
// getValue()를 가진 객체(에디터 인스턴스)를 찾아 값을 읽기만 한다. 에디터를 바꾸지 않는다.

import { MAIN_WORLD_REPLY, MAIN_WORLD_REQUEST } from "./protocol";

type Editorish = { getValue: () => string; getModel?: () => { getLanguageId?: () => string } | null };

function isEditor(v: unknown): v is Editorish {
  return !!v && typeof v === "object" && typeof (v as Editorish).getValue === "function";
}

function findEditorInFiber(el: Element): Editorish | null {
  const key = Object.keys(el).find((k) => k.startsWith("__reactFiber$"));
  if (!key) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let fiber: any = (el as any)[key];
  for (let depth = 0; fiber && depth < 40; depth++, fiber = fiber.return) {
    const candidates: unknown[] = [fiber.stateNode];
    const props = fiber.memoizedProps;
    if (props && typeof props === "object") candidates.push(...Object.values(props));
    for (let hook = fiber.memoizedState, i = 0; hook && i < 30; hook = hook.next, i++) {
      const s = hook?.memoizedState;
      candidates.push(s, s?.current);
    }
    for (const c of candidates) {
      if (isEditor(c)) return c;
      const cur = (c as { current?: unknown } | null)?.current;
      if (isEditor(cur)) return cur;
    }
  }
  return null;
}

window.addEventListener("message", (e: MessageEvent) => {
  if (e.source !== window || e.data?.type !== MAIN_WORLD_REQUEST) return;
  let code: string | null = null;
  let language: string | null = null;
  try {
    for (const el of Array.from(document.querySelectorAll(".monaco-editor[data-uri]"))) {
      const ed = findEditorInFiber(el);
      if (!ed) continue;
      code = ed.getValue();
      language = ed.getModel?.()?.getLanguageId?.() ?? null;
      break;
    }
  } catch {
    code = null;
  }
  window.postMessage({ type: MAIN_WORLD_REPLY, reqId: e.data.reqId, code, language }, window.location.origin);
});
