// 풀고 난 뒤 화면 (M4·M5 범위): 걸린 질문 6칸, 실행 횟수, 끝내기(통과/그만둠), 저장 안내, 내 기록 보기.
// 몰랐던 것·알게 된 것·다시 풀기 일정은 M6에서 붙인다.

import type { Session } from "../core/session";
import { localIso } from "../core/session";
import { Cells } from "./RecordsView";

export type SaveState = { status: "idle" } | { status: "saving" } | { status: "saved"; at: string } | { status: "error"; message: string };

export function AfterView({
  session,
  update,
  save,
  onShowRecords,
  onRestart,
}: {
  session: Session;
  update: (f: (s: Session) => Session) => void;
  save: SaveState;
  onShowRecords: () => void;
  onRestart: () => void;
}) {
  const finished = session.result !== null;
  const finish = (result: "passed" | "gave_up") => update((s) => ({ ...s, result, finishedAt: localIso(new Date()) }));

  return (
    <>
      <div class="card">
        <h2>걸린 질문</h2>
        <Cells questions={session.questions} />
        <p class="small muted" style={{ marginTop: "8px" }}>
          초록은 한 번에 통과, 빨강은 한 번이라도 걸린 질문, 회색은 건너뛴 질문입니다.
        </p>
        <p class="small" style={{ marginTop: "6px" }} aria-label="실행 요약">
          실행 {session.runs.total}번 · 오류 {session.runs.errors} · 출력 다름 {session.runs.mismatches}
          {session.hints.maxLevel > 0 && ` · 힌트 ${session.hints.maxLevel}단계까지`}
          {session.hints.answerRevealed && " · 정답 봄"}
        </p>
      </div>

      {!finished && (
        <div class="card field">
          <h2>이 문제를 마쳤나요?</h2>
          <p class="small muted">제출해서 통과했으면 "다 풀었어요", 오늘은 여기까지면 "그만할래요"를 누르세요.</p>
          <div class="row">
            <button class="btn primary grow" onClick={() => finish("passed")}>
              다 풀었어요
            </button>
            <button class="btn" onClick={() => finish("gave_up")}>
              그만할래요
            </button>
          </div>
        </div>
      )}

      {finished && (
        <div class="card field">
          <h2>{session.result === "passed" ? "통과했습니다" : "여기까지 했습니다"}</h2>
          {save.status === "saved" && <div class="notice good">이 풀이는 내 기록에 저장됐습니다.</div>}
          {save.status === "saving" && (
            <div class="notice info">
              <span class="spin" /> 저장하는 중…
            </div>
          )}
          {save.status === "error" && <div class="notice bad">저장하지 못했습니다: {save.message}</div>}
          <div class="row">
            <button class="btn primary grow" onClick={onShowRecords}>
              내 기록 보기
            </button>
            <button class="btn" onClick={onRestart}>
              처음부터 다시 풀기
            </button>
          </div>
        </div>
      )}

      {!finished && save.status === "saved" && <p class="small muted">진행 중인 풀이도 자동으로 저장됩니다.</p>}
      {!finished && save.status === "error" && <div class="notice bad">저장하지 못했습니다: {save.message}</div>}
    </>
  );
}
