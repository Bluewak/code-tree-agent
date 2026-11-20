// 확장 설정 페이지(chrome-extension://…/options.html). API 키는 여기서만 받는다.

import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import { CSS } from "../ui/styles";
import { send } from "../messages";
import { PROVIDERS, providerInfo } from "../llm/types";
import { DEFAULT_SETTINGS, type Settings } from "../storage/settings";
import { ConnectionStatus, Section, TestNotice, useConnectionTest, useLlmStatus } from "../ui/SettingsView";

const PAGE_CSS = `
body { margin: 0; min-height: 100vh; background: linear-gradient(180deg, #F8FBF9, #ECEFEE); }
.page { max-width: 560px; margin: 0 auto; padding: 32px 16px 48px; display: flex; flex-direction: column; gap: 14px; }
.page > h1 { margin: 0 0 4px; font-size: 22px; font-weight: 600; }
`;

function Options() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [key, setKey] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const [status, refresh] = useLlmStatus([settings.provider, settings.model, saved]);
  const test = useConnectionTest();

  /** 입력한 키를 저장하고 바로 연결을 확인한다 */
  async function saveKey() {
    if (!key.trim()) return;
    test.clear();
    await send({ type: "llm.setKey", provider: "claude-api", key });
    setKey("");
    setSaved("저장했어요.");
    refresh();
    await test.run();
  }

  useEffect(() => {
    send({ type: "settings.get" }).then(setSettings);
  }, []);
  const update = async (patch: Partial<Settings>) => setSettings(await send({ type: "settings.set", patch }));
  const info = providerInfo(settings.provider);

  return (
    <div class="root page">
      <h1>코드트리 학습 서랍 설정</h1>
      <Section title="연결 방식">
        {PROVIDERS.map((p) => (
          <label class={`option${p.available ? "" : " disabled"}`}>
            <input type="radio" name="provider" checked={settings.provider === p.id} disabled={!p.available} onChange={() => update({ provider: p.id })} />
            <span class="grow">{p.label}</span>
            {!p.available && <span class="small muted">준비 중</span>}
          </label>
        ))}
        <ConnectionStatus status={status} />
      </Section>

      {info.id === "claude-api" && (
        <Section title="Claude API 키">
          <p class="small muted">
            console.anthropic.com에서 만든 키를 넣어 주세요. 키는 이 브라우저 안에만 저장되고, 채점·힌트를 Claude에게 물을 때만 써요. 코드트리 페이지에는 전달되지 않아요. 사용 요금은 이 키의 계정으로 나가요.
          </p>
          <input
            type="password"
            autocomplete="off"
            spellcheck={false}
            placeholder={status?.hasKey ? "저장된 키가 있어요. 바꾸려면 새 키를 넣으세요" : "sk-ant-…"}
            value={key}
            onInput={(e) => setKey((e.target as HTMLInputElement).value)}
          />
          <div class="row">
            <button class="btn primary" disabled={!key.trim() || test.busy} onClick={saveKey}>
              저장
            </button>
            <button
              class="btn"
              disabled={test.busy}
              onClick={() => (key.trim() ? saveKey() : test.run())}
              title={key.trim() ? "입력한 키를 저장하고 확인해요" : "저장된 키로 확인해요"}
            >
              {test.busy ? <span class="spin" /> : "연결 확인"}
            </button>
            {status?.hasKey && (
              <button
                class="btn ghost"
                onClick={async () => {
                  test.clear();
                  await send({ type: "llm.setKey", provider: "claude-api", key: null });
                  setSaved("키를 지웠어요.");
                  refresh();
                }}
              >
                키 지우기
              </button>
            )}
          </div>
          {saved && !test.result && !test.busy && <div class="notice good">{saved}</div>}
          <TestNotice result={test.result} />
          <label class="field">
            <span class="small muted">모델</span>
            <select value={settings.model} onChange={(e) => update({ model: (e.target as HTMLSelectElement).value })}>
              {info.models.map((m) => (
                <option value={m.id}>{m.label}</option>
              ))}
            </select>
          </label>
        </Section>
      )}
    </div>
  );
}

const style = document.createElement("style");
style.textContent = CSS + PAGE_CSS;
document.head.appendChild(style);
render(<Options />, document.getElementById("app")!);
