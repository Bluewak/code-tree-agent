// 내 기록 보기 + 글로 복사하기. 통계는 저장된 기록에서 매번 계산한다.

import { useEffect, useState } from "preact/hooks";
import { send } from "../messages";
import { inDisplayOrder, questionDef } from "../core/questions";
import type { AttemptRecord } from "../storage/schema";
import { computeStats, resultText } from "../storage/records";
import { ConfirmButton } from "./ConfirmButton";

const STATE_LABEL = { passed: "통과", failed: "걸림", skipped: "건너뜀", not_reached: "안 함" } as const;

export function Cells({ questions }: { questions: AttemptRecord["questions"] }) {
  return (
    <div class="cells">
      {inDisplayOrder(questions).map((q) => (
        <div class={`cell ${q.state}`} title={`${questionDef(q.q).short}: ${STATE_LABEL[q.state]}`}>
          {questionDef(q.q).short}
        </div>
      ))}
    </div>
  );
}

/** 클립보드에 쓴다. 페이지 정책으로 막히면 예전 방식(execCommand)으로 */
export async function copyText(text: string, container: Node): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;opacity:0;pointer-events:none";
    container.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    if (!ok) throw new Error("복사하지 못했어요. 다시 눌러 주세요.");
  }
}

export function CopyButton({ label = "글로 복사하기" }: { label?: string }) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <>
      <button
        class="btn"
        onClick={async (e) => {
          // await 뒤에는 e.currentTarget이 null이 되므로 먼저 잡아 둔다
          const container = (e.currentTarget as HTMLElement).parentNode!;
          try {
            const { text } = await send({ type: "records.markdown" });
            await copyText(text, container);
            setMsg({ ok: true, text: "복사했어요. 메모장이나 노트에 붙여 넣으세요." });
          } catch (err) {
            setMsg({ ok: false, text: err instanceof Error ? err.message : String(err) });
          }
        }}
      >
        {label}
      </button>
      {msg && <div class={`notice ${msg.ok ? "good" : "bad"}`}>{msg.text}</div>}
    </>
  );
}

export function RecordsView({ onDeleted }: { onDeleted: (id: string | "all") => Promise<void> | void }) {
  const [records, setRecords] = useState<AttemptRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = () =>
    send({ type: "records.list" })
      .then(setRecords)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  useEffect(() => {
    reload();
  }, []);

  if (error) return <div class="notice bad">{error}</div>;
  if (!records)
    return (
      <div class="card muted">
        <span class="spin" /> 불러오는 중…
      </div>
    );
  const st = computeStats(records);

  return (
    <>
      <div class="stats">
        <div class="stat">
          <b>{st.attempts}</b>
          <span>풀이 (문제 {st.problems}개)</span>
        </div>
        <div class="stat">
          <b>{st.passed}</b>
          <span>통과</span>
        </div>
        <div class="stat">
          <b>{st.ongoing}</b>
          <span>진행 중</span>
        </div>
      </div>
      <div class="row">
        <CopyButton />
      </div>
      {records.length === 0 && <div class="card muted">아직 기록이 없어요. 문제에서 질문에 답하면 자동으로 쌓여요.</div>}
      {records.map((r) => (
        <div class="card rec">
          <div class="row">
            <h2 class="grow" style={{ margin: 0 }}>
              {r.title}
            </h2>
            <span class={`badge ${r.result ?? "ongoing"}`}>{resultText(r.result)}</span>
          </div>
          <div class="meta">
            <span>
              {r.startedAt.slice(0, 10)} {r.startedAt.slice(11, 16)}
              {r.language ? ` · ${r.language}` : ""}
            </span>
            {(r.hints.maxLevel > 0 || r.hints.answerRevealed) && (
              <span>
                힌트 {r.hints.maxLevel}단계
                {r.hints.answerRevealed ? " · 정답 봄" : ""}
              </span>
            )}
          </div>
          <Cells questions={r.questions} />
          <div class="row end">
            <ConfirmButton
              small
              label="이 기록 지우기"
              question={`${r.title} (${r.startedAt.slice(0, 10)} ${r.startedAt.slice(11, 16)}) 기록을 지울까요? 되돌릴 수 없어요.`}
              confirmLabel="지우기"
              onConfirm={async () => {
                await send({ type: "records.delete", id: r.id });
                await onDeleted(r.id);
                await reload();
              }}
            />
          </div>
        </div>
      ))}
      {records.length > 0 && (
        <div class="row end">
          <ConfirmButton
            label="모든 기록 지우기"
            question={`풀이 기록 ${records.length}개와 진행 중인 풀이를 모두 지울까요? 되돌릴 수 없어요. 설정과 키는 그대로 남아요.`}
            confirmLabel="모두 지우기"
            onConfirm={async () => {
              await send({ type: "records.clear" });
              await onDeleted("all");
              await reload();
            }}
          />
        </div>
      )}
    </>
  );
}
