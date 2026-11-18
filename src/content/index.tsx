// 콘텐츠 스크립트: 서랍을 Shadow DOM에 띄운다. 페이지 폭을 바꾸는 CSS는 넣지 않는다.

import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import { App } from "../ui/App";
import { CSS } from "../ui/styles";
import { createCodetreeReader } from "../sites/codetree/reader";
import { DEFAULT_SETTINGS, SETTINGS_KEY, loadSettings, normalizeSettings, type Settings } from "../storage/settings";
import type { TabMessage } from "../messages";

const ROOT_ID = "codetree-study-agent-root";

function injectFonts() {
  if (document.getElementById(`${ROOT_ID}-fonts`)) return;
  const style = document.createElement("style");
  style.id = `${ROOT_ID}-fonts`;
  // Shadow DOM 안의 @font-face는 크롬에서 적용되지 않으므로 문서 head에 넣는다. 이름이 CSA로 시작해 페이지 글꼴과 섞이지 않는다.
  style.textContent = __FONT_CSS__.replaceAll("__FONT_BASE__", chrome.runtime.getURL("fonts/"));
  document.head.appendChild(style);
}

function Root({ host }: { host: HTMLElement }) {
  const [reader] = useState(() => createCodetreeReader(window));
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [pageKey, setPageKey] = useState(0);

  // 설정 읽기 + 바뀌면 따라가기
  useEffect(() => {
    loadSettings().then(setSettings).catch(() => {});
    const onChange = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === "local" && changes[SETTINGS_KEY]) setSettings(normalizeSettings(changes[SETTINGS_KEY].newValue));
    };
    chrome.storage.onChanged.addListener(onChange);
    return () => chrome.storage.onChanged.removeListener(onChange);
  }, []);

  // 단축키(백그라운드가 전달)
  useEffect(() => {
    const onMsg = (msg: TabMessage) => {
      if (msg?.type === "drawer.toggle") setOpen((o) => !o);
    };
    chrome.runtime.onMessage.addListener(onMsg);
    return () => chrome.runtime.onMessage.removeListener(onMsg);
  }, []);

  // Esc, 바깥 클릭으로 닫기
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onDown = (e: PointerEvent) => {
      if (!e.composedPath().includes(host)) setOpen(false);
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", onDown, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerdown", onDown, true);
    };
  }, [open, host]);

  // SPA 이동: 주소가 바뀌면 문제를 다시 읽는다
  useEffect(() => {
    let last = location.href;
    const t = setInterval(() => {
      if (location.href !== last) {
        last = location.href;
        setPageKey((k) => k + 1);
      }
    }, 800);
    return () => clearInterval(t);
  }, []);

  return <App reader={reader} open={open} setOpen={setOpen} settings={settings} pageKey={pageKey} />;
}

function mount() {
  if (document.getElementById(ROOT_ID)) return;
  injectFonts();
  const host = document.createElement("div");
  host.id = ROOT_ID;
  // 호스트는 크기가 없다. 손잡이와 서랍은 position: fixed로 페이지 위에 겹친다.
  host.style.cssText = "all: initial; position: fixed; top: 0; left: 0; width: 0; height: 0; z-index: 2147483000;";
  document.documentElement.appendChild(host);
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = CSS;
  shadow.appendChild(style);
  const app = document.createElement("div");
  shadow.appendChild(app);
  // 서랍 안의 키 입력이 코드트리 단축키로 새지 않게 막는다
  for (const type of ["keydown", "keyup", "keypress"]) {
    app.addEventListener(type, (e) => {
      if ((e as KeyboardEvent).key !== "Escape") e.stopPropagation();
    });
  }
  render(<Root host={host} />, app);
}

mount();
