// 6개 질문 (지시서 4절, 2026-11-20 개정). 흐름은 이 코드가 쥐고, LLM은 채점·힌트 같은 좁은 일만 한다.
// q 번호는 기록용 식별자(지시서 표 그대로)이고, 화면에는 DISPLAY_ORDER 순서로 보여 준다.

export type QNum = 1 | 2 | 3 | 4 | 5 | 6;

export interface FieldDef {
  key: string;
  /** 칸 왼쪽 라벨 (2~4글자) */
  label: string;
  placeholder: string;
}

export interface QuestionDef {
  q: QNum;
  /** 화면에 쓰는 짧은 이름 */
  short: string;
  text: string;
  /** 쓰는 틀: 채울 항목을 순서대로 (작은 회색 글씨, 계속 보임) */
  guide: string;
  /** 입력칸 안의 흐린 예시 (다른 문제 "최댓값과 첫 위치 찾기"의 답) */
  example: string;
  /** "왜 이 칸을 쓰나요?" 한 줄 */
  why: string;
  /** 통과 기준 (LLM에게만 보낸다) */
  criteria: string;
  /** 이 칸의 힌트를 만들 때 덧붙일 안내 (LLM에게만) */
  hintGuide: string;
  /** 두 번째 '다시'부터 바로 정정해도 되는 칸 (읽기 문제) */
  correctOnSecond: boolean;
  /** 채점에 계산이 필요해 LLM 노력 수준을 올리는 칸 */
  heavy: boolean;
  /** 작은 칸으로 나눠 받는 칸. 없으면 큰 입력칸 하나 */
  fields?: FieldDef[];
}

/** 흐린 예시가 가져온 다른 문제 */
export const EXAMPLE_PROBLEM = "최댓값과 첫 위치 찾기";

/** 화면 순서: 입력 → 출력 → 손풀이 → 규칙 → 구조 → 경계 */
export const DISPLAY_ORDER: readonly QNum[] = [1, 2, 4, 3, 5, 6];

/** q 번호 순서 (기록 배열 순서) */
export const QUESTIONS: readonly QuestionDef[] = [
  {
    q: 1,
    short: "입력",
    text: "입력을 줄별로 정리하고, 값마다 이름을 붙이세요.",
    guide: "몇째 줄 이름: 종류와 개수 / 범위 / 구분",
    example: "예:\n1줄 n: 정수 1개 / 1~100\n2줄 nums: 정수 n개 / -100~100 / 공백 구분",
    why: "다음 칸부터는 이 이름으로 말해요. 범위는 구조 칸에서 시간을 어림할 때 써요.",
    criteria:
      "줄마다 들어오는 값의 개수와 종류(정수인지 글자인지)를 맞게 짚었는가. 한 줄에 여러 개인지 여러 줄에 하나씩인지, 첫 줄의 개수·테스트 케이스 수 같은 값을 빠뜨리지 않았는가. 범위를 안 적었으면 보완 통과.",
    hintGuide: "문제의 '입력 형식' 부분에서 줄 수와 한 줄의 개수를 다시 보게 한다.",
    correctOnSecond: true,
    heavy: false,
  },
  {
    q: 2,
    short: "출력",
    text: "출력 모양을 줄마다 적고, -1처럼 따로 정해진 출력이 있으면 함께 적으세요.",
    guide: "몇째 줄: 무엇 / 개수 / 구분 · 정해진 출력: 값 (없으면 없음)",
    example: "예:\n1줄: 최댓값 / 1개\n2줄: 위치 / 1개 / 1부터 셈\n정해진 출력: 없음",
    why: "답이 맞아도 줄 수나 띄어쓰기, 0부터인지 1부터인지가 다르면 오답이에요.",
    criteria:
      "줄 수, 한 줄의 개수, 구분자, 정확한 글자(YES/NO, INF 등), 문제에 정해진 특수 출력(-1 등), 순서가 문제와 모두 맞는가. 하나라도 틀리면 다시. 문제에 특수 출력이 없으면 '없음'이 맞다.",
    hintGuide: "문제의 '출력 형식' 부분에서 줄 수, 한 줄의 개수, 구분자를 다시 보게 한다.",
    correctOnSecond: true,
    heavy: false,
  },
  {
    q: 3,
    short: "규칙",
    text: "방금 한 방법을 숫자 없이 입력 이름으로, 어떤 입력에도 되게 한 문장으로 적으세요.",
    guide: "이름을 ~ 보며, ~이면 ~한다. 끝나면 ~이 답 (느려도 됨)",
    example: "예: nums의 첫 수를 최대로 두고 앞에서부터 보며, 지금 최대보다 크면 그 값과 위치를 기억한다. 끝나면 기억한 것이 답.",
    why: "'최댓값을 구한다'는 무엇을 구할지일 뿐, 어떻게는 아니에요. 이 문장이 그대로 코드가 돼요.",
    criteria:
      "이 문장대로 아무 유효한 입력에 따라 하면 답이 나오는가. 느린 방법도 통과. 문제에 나오는 상수(예: 45)와 출력값(예: 0, 1)은 써도 된다. 답의 성질만 말한 문장(예: '최소 일수를 구한다', '최댓값을 구한다')은 다시. 틀린 방법(예: 반례가 있는 욕심쟁이 방법)은 다시. 출력에 위치가 있으면 몇부터 세는지까지. 앞 칸과 같은 말이면 '위와 같음'도 인정.",
    hintGuide: "1단계는 '방금 손으로 한 순서를 그대로 말로 옮기면?' 또는 '이 방법이 틀리는 작은 입력이 있을까?'처럼 묻는다.",
    correctOnSecond: false,
    heavy: true,
  },
  {
    q: 4,
    short: "손풀이",
    text: "작은 입력 하나를 골라 실제 숫자로 풀고, 과정을 한 줄로 적으세요.",
    guide: "입력 → 바뀌는 값을 차례로 → 답 (예제 입력이나 3~5개짜리)",
    example: "예: 4 9 2 (n=3) → 최대 4, 1번 → 9>4라 최대 9, 2번 → 2는 작아서 그대로 → 9, 2",
    why: "손으로 한 번 풀어 봐야 다음 칸에서 방금 한 일을 문장으로 옮길 수 있어요.",
    criteria:
      "입력이 문제 형식과 제한에 맞고, 핵심 중간 단계와 답이 맞는가. 계산 실수가 있으면 다시(틀린 위치를 짚는다). 과정 없이 답만 있으면 보완 통과. 주어진 예제를 따라가도 된다.",
    hintGuide: "1단계는 '규칙이 갈라지는 값(조건이 바뀌는 쪽)으로 골라 보면 더 많이 배워요'처럼 권하거나, 틀린 단계를 다시 계산해 보게 한다.",
    correctOnSecond: false,
    heavy: true,
  },
  {
    q: 5,
    short: "구조",
    text: "가장 큰 입력에서 시간 안에 되는지 어림하고, 코드 뼈대를 나눠 적으세요.",
    guide: "횟수: 각 반복의 횟수를 곱하기 (n번 안에 n번이면 n×n) · 기준: 파이썬 1초 ≈ 1,000만 번",
    example: "",
    why: "다 짠 뒤 시간 초과로 버리는 일을 미리 막아요. 뼈대는 규칙을 코드 순서로 옮긴 거예요.",
    criteria:
      "횟수 어림이 제한에 맞고(반복만이 아니라 뒤집기·정렬·재귀 같은 비용도), '됨/안 됨' 판정이 그 횟수와 맞는가(파이썬은 약 1,000만 번이 1초). 안 됨이면 무엇을 왜 줄이는지가 맞는가. 뼈대(준비/반복/출력)가 규칙을 구현하고, 반복 범위의 처음과 끝, 누적 변수의 초깃값, 줄을 끝내는 방법이 맞는가. 반복이 필요 없는 문제는 반복 칸에 조건(if)을 써도 된다. 준비가 빠졌지만 결과에 영향이 없으면 보완 통과.",
    hintGuide: "1단계는 빠진 요소의 이름을 짚어 되묻는다('처음 최댓값은 얼마로 두나요?', '가장 크면 몇 번 도나요?').",
    correctOnSecond: false,
    heavy: true,
    fields: [
      { key: "count", label: "횟수", placeholder: "예: n 최대 100 → 100번" },
      { key: "reduce", label: "줄이기", placeholder: "예: 되풀이되는 계산을 한 번으로" },
      { key: "prep", label: "준비", placeholder: "예: 최대는 첫 수 / 위치는 1" },
      { key: "loop", label: "반복", placeholder: "예: 2번째~n번째: 더 크면 둘 다 바꿈" },
      { key: "out", label: "출력", placeholder: "예: 반복 끝나고 최대 / 위치" },
    ],
  },
  {
    q: 6,
    short: "경계",
    text: "뼈대가 틀리기 쉬운 입력을 하나 골라, 그때의 정답과 함께 적으세요.",
    guide: "후보: 가장 작은 n / 같은 값 / 맨 끝 값",
    example: "",
    why: "채점은 평범한 입력보다 이런 입력에서 갈려요. 여기 적은 입력은 제출 전에 직접 넣어 볼 입력이에요.",
    criteria:
      "고른 입력이 제한 안의 유효한 입력이고, 적은 정답이 맞으며, 어디서 틀리기 쉬운지(함정)를 짚었는가. '특별히 없음'은 받지 않는다(최소 입력이라도 하나). 이 문제에 더 중요한 함정이 따로 있으면 통과시키되 feedback에 '하나만 더'로 한 줄 덧붙인다.",
    hintGuide: "1단계는 후보(가장 작은 입력, 같은 값, 맨 끝, 답이 없는 경우) 중 하나를 넣어 보게 한다.",
    correctOnSecond: true,
    heavy: true,
    fields: [
      { key: "input", label: "입력", placeholder: "예: 5 5 (n=2)" },
      { key: "trap", label: "함정", placeholder: "예: '크거나 같으면'으로 쓰면 위치 2" },
      { key: "answer", label: "정답", placeholder: "예: 5 / 1" },
    ],
  },
];

export type QState = "passed" | "failed" | "skipped" | "not_reached";

/** 한 질문의 진행. state는 기록용 의미(지시서 6절), resolved는 화면 진행용 */
export interface QuestionProgress {
  q: QNum;
  /**
   * 기록용 상태. passed: 한 번에 통과(보완 통과 포함) / failed: 한 번이라도 '다시'(나중에 통과·건너뛰기·답 공개로 끝나도) /
   * skipped: 틀린 적 없이 건너뜀 / not_reached: 손대지 않음
   */
  state: QState;
  /** 통과했거나 건너뛰었거나 답을 보고 넘어가서 다음 칸으로 갔는가 */
  resolved: boolean;
  /** '다시'를 받은 횟수까지 포함한 제출 횟수 */
  attempts: number;
  answer: string | null;
  /** 통과한 답을 한 줄로 접은 것 */
  summary: string | null;
  /** 마지막 피드백: 다시면 틀린 위치를 짚는 한 줄, 보완 통과면 덧붙임 한 줄 */
  feedback: string | null;
  /** 세 번째 '다시'로 넘어갈 때 보여 준 이 칸의 답 */
  revealed: string | null;
  /** 이 칸에서 받은 힌트들 (단계 순서) */
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
    revealed: null,
    hints: [],
  }));
}

export function questionDef(q: number): QuestionDef {
  const d = QUESTIONS.find((x) => x.q === q);
  if (!d) throw new Error(`없는 질문 번호: ${q}`);
  return d;
}

/** 화면 순서에서 몇 번째인지 (1부터) */
export function displayIndex(q: number): number {
  return DISPLAY_ORDER.indexOf(q as QNum) + 1;
}

/** 화면 순서로 늘어놓기 */
export function inDisplayOrder<T extends { q: number }>(items: readonly T[]): T[] {
  return DISPLAY_ORDER.map((q) => items.find((x) => x.q === q)).filter((x): x is T => !!x);
}

/** 작은 칸 답을 한 덩어리 글로 (채점과 기록용) */
export function joinFields(def: QuestionDef, values: Record<string, string>, extra: Record<string, string> = {}): string {
  const lines: string[] = [];
  for (const f of def.fields ?? []) {
    const v = values[f.key]?.trim();
    if (f.key === "count") {
      lines.push(`횟수: ${v || "(없음)"}${extra.verdict ? ` → ${extra.verdict}` : ""}`);
      continue;
    }
    if (v) lines.push(`${f.label}: ${v}`);
  }
  return lines.join("\n");
}
