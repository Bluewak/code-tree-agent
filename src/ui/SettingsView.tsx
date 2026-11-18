// 서랍 안의 설정 화면: 계정 연결, 서랍 위치, 단축키, 6개 질문 켜고 끄기, 내 기록

import type { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";
import { send, type LlmStatus } from "../messages";
import type { Settings } from "../storage/settings";
import { PROVIDERS } from "../llm/types";

export function Section({ title, children }: { title: string; children: ComponentChildren }) {
  return (
    <section class="card field">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export function ConnectionStatus({ status }: { status: LlmStatus | null }) {
  if (!status) return <span class="status muted"><span class="spin" /> 확인 중…</span>;
  const on = status.available && status.hasKey;
  return (
    <span class="status">
      <span class={`dot${on ? " on" : ""}`} />
      {!status.available ? "준비 중인 방식입니다" : on ? `연결됨 · ${status.model}` : "키가 아직 없습니다"}
    </span>
  );
}

export function useLlmStatus(deps: unknown[] = []) {
  const [status, setStatus] = useState<LlmStatus | null>(null);
  const refresh = () => send({ type: "llm.status" }).then(setStatus).catch(() => setStatus(null));
  useEffect(() => {
    refresh();
  }, deps);
  return [status, refresh] as const;
}

export type TestResult = { ok: boolean; text: string } | null;

/** 연결 확인. 결과는 버튼 줄 밖에 보여 주고, 키를 바꾸면 clear()로 지운다 */
export function useConnectionTest() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<TestResult>(null);
  const run = async () => {
    setBusy(true);
    setResult(null);
    try {
      const r = await send({ type: "llm.test" });
      setResult({ ok: true, text: r.message });
    } catch (e) {
      setResult({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };
  return { busy, result, run, clear: () => setResult(null) };
}

export function TestNotice({ result }: { result: TestResult }) {
  return result ? <div class={`notice ${result.ok ? "good" : "bad"}`}>{result.text}</div> : null;
}

export function SettingsView({ settings, children }: { settings: Settings; children?: ComponentChildren }) {
  const [status] = useLlmStatus([settings.provider, settings.model]);
  const test = useConnectionTest();
  const [shortcut, setShortcut] = useState<string | null>(null);
  useEffect(() => {
    send({ type: "shortcut.get" }).then((r) => setShortcut(r.shortcut)).catch(() => setShortcut(null));
  }, []);
  const set = (patch: Partial<Settings>) => send({ type: "settings.set", patch }).catch(() => {});

  return (
    <>
      <Section title="계정 연결">
        <div role="radiogroup" aria-label="연결 방식">
          {PROVIDERS.map((p) => (
            <label class={`option${p.available ? "" : " disabled"}`}>
              <input
                type="radio"
                name="provider"
                checked={settings.provider === p.id}
                disabled={!p.available}
                onChange={() => set({ provider: p.id })}
              />
              <span class="grow">{p.label}</span>
              {!p.available && <span class="small muted">준비 중</span>}
            </label>
          ))}
        </div>
        <ConnectionStatus status={status} />
        <p class="small muted">키는 확장 설정 페이지에서 넣습니다. 키는 이 브라우저 안에만 저장되고 코드트리 페이지에는 전달되지 않습니다.</p>
        <div class="row">
          <button class="btn primary" onClick={() => send({ type: "open.options" })}>
            {status?.hasKey ? "키 바꾸기" : "키 넣기"}
          </button>
          <button class="btn" disabled={test.busy} onClick={test.run}>
            {test.busy ? <span class="spin" /> : "연결 확인"}
          </button>
        </div>
        <TestNotice result={test.result} />
      </Section>

      <Section title="서랍 위치">
        <div class="seg">
          <button aria-pressed={settings.side === "left"} onClick={() => set({ side: "left" })}>
            왼쪽
          </button>
          <button aria-pressed={settings.side === "right"} onClick={() => set({ side: "right" })}>
            오른쪽
          </button>
        </div>
      </Section>

      <Section title="단축키">
        <div class="row">
          <span class="grow">
            서랍 열기/닫기 {shortcut ? <span class="kbd">{shortcut}</span> : <span class="muted">지정 안 됨</span>}
          </span>
          <button class="btn" onClick={() => send({ type: "open.shortcuts" })}>
            바꾸기
          </button>
        </div>
        <p class="small muted">서랍이 열려 있을 때 Esc나 서랍 바깥 클릭으로도 닫힙니다. 툴바의 확장 아이콘을 누르면 손잡이가 숨겨집니다.</p>
      </Section>

      <Section title="6개 질문">
        <label class="option">
          <input type="checkbox" checked={settings.questionsEnabled} onChange={(e) => set({ questionsEnabled: (e.target as HTMLInputElement).checked })} />
          <span>코드를 치기 전에 6개 질문 받기</span>
        </label>
      </Section>

      {children}
    </>
  );
}
