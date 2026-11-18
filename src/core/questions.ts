// 6개 질문과 진행 상태. 흐름은 이 코드가 쥐고, LLM은 채점·힌트 같은 좁은 일만 한다.

export interface QuestionDef {
  q: 1 | 2 | 3 | 4 | 5 | 6;
  /** 화면에 쓰는 짧은 이름 */
  short: string;
  text: string;
  /** 무엇을 짚으면 통과인지 (채점 기준, LLM에게만 보낸다) */
  criteria: string;
  placeholder: string;
}

export const QUESTIONS: readonly QuestionDef[] = [
  {
    q: 1,
    short: "입력",
    text: "무엇이 입력되는가",
    criteria: "입력으로 들어오는 값들(개수, 의미, 줄 구성)을 맞게 짚었는가. 형식의 세부까지 완벽할 필요는 없다.",
    placeholder: "예: 첫 줄에 n, m. 그다음 n줄에 m개씩 수가 두 묶음",
  },
  {
    q: 2,
    short: "출력",
    text: "무엇을 어떤 형식으로 출력하는가",
    criteria: "무엇을 출력하는지와 형식(줄 수, 구분자 등)을 맞게 짚었는가.",
    placeholder: "예: n줄, 한 줄에 m개를 공백으로 구분",
  },
  {
    q: 3,
    short: "규칙",
    text: "규칙을 한 문장으로 말하면",
    criteria: "입력에서 출력을 만드는 핵심 규칙을 한 문장으로 맞게 말했는가.",
    placeholder: "예: 같은 칸의 두 값이 같으면 0, 다르면 1",
  },
  {
    q: 4,
    short: "손풀이",
    text: "작은 예제를 손으로 풀면",
    criteria: "작은 예제(직접 만든 것이어도 됨)에 규칙을 적용한 결과가 맞는가. 계산 실수가 있으면 통과가 아니다.",
    placeholder: "예: [[1,2],[3,4]]와 [[1,2],[3,5]] → 0 0 / 0 1",
  },
  {
    q: 5,
    short: "구조",
    text: "출력 한 줄은 무엇에서 나오는가, 무엇을 몇 번 도는가",
    criteria: "출력 한 줄(또는 한 값)이 입력의 어느 부분에서 나오는지, 반복을 무엇에 대해 몇 번 도는지 맞게 짚었는가.",
    placeholder: "예: 출력 i번째 줄은 두 격자의 i번째 줄에서. 바깥은 n번, 안쪽은 m번",
  },
  {
    q: 6,
    short: "경계",
    text: "경계 케이스와 크기는",
    criteria: "가장 작은/큰 입력, 특이한 경우 중 하나 이상을 짚고, 제한 조건으로 보아 시간·메모리가 괜찮은지 말했는가.",
    placeholder: "예: n=m=1이어도 되고, 최대 100×100이라 이중 반복이면 충분",
  },
];

export type QState = "passed" | "failed" | "skipped" | "not_reached";

/** 한 질문의 진행. state는 기록용 의미(아래), resolved는 화면 진행용 */
export interface QuestionProgress {
  q: QuestionDef["q"];
  /**
   * 기록용 상태. passed: 한 번에 통과 / failed: 한 번이라도 틀림(나중에 통과·건너뛰기 해도 failed) /
   * skipped: 틀린 적 없이 건너뜀 / not_reached: 손대지 않음
   */
  state: QState;
  /** 통과했거나 건너뛰어서 다음 질문으로 넘어갔는가 */
  resolved: boolean;
  attempts: number;
  answer: string | null;
  /** 통과한 답을 한 줄로 접은 것 */
  summary: string | null;
  /** 마지막 피드백(틀렸을 때 되묻는 한 줄) */
  feedback: string | null;
  /** 이 질문에서 받은 힌트들 (단계 순서) */
  hints: string[];
}

export function initialQuestions(): QuestionProgress[] {
  return QUESTIONS.map((d) => ({
    q: d.q,
    state: "not_reached",
    resolved: false,
    attempts: 0,
    answer: null,
    summary: null,
    feedback: null,
    hints: [],
  }));
}

export function questionDef(q: number): QuestionDef {
  const d = QUESTIONS.find((x) => x.q === q);
  if (!d) throw new Error(`없는 질문 번호: ${q}`);
  return d;
}
