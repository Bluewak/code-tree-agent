import type { ProblemSnapshot } from "../sites/types";

export function ProblemCard({ problem, defaultOpen = true }: { problem: ProblemSnapshot; defaultOpen?: boolean }) {
  return (
    <details class="card problem" open={defaultOpen}>
      <summary>문제 본문</summary>
      <div class="statement">{problem.statement || "본문을 읽지 못했어요. 페이지를 새로고침해 보세요."}</div>
    </details>
  );
}
