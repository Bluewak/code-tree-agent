import { readFileSync } from "node:fs";
import {
  cleanTitle,
  extractStatement,
  normalizeOutput,
  parseIdeStorage,
  parseProblemId,
  parseRunResult,
} from "../src/sites/codetree/parse";

const fx = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

describe("parseProblemId", () => {
  it("문제 URL에서 problemId를 꺼낸다", () => {
    expect(
      parseProblemId("https://www.codetree.ai/ko/trails/complete/curated-cards/intro-compare-two-grids/description"),
    ).toBe("intro-compare-two-grids");
  });
  it("description으로 끝나는 다른 경로도 받는다", () => {
    expect(parseProblemId("https://www.codetree.ai/ko/x/y/some-problem/description")).toBe("some-problem");
  });
  it("문제 페이지가 아니면 null", () => {
    expect(parseProblemId("https://www.codetree.ai/ko/trails")).toBeNull();
    expect(parseProblemId("not a url")).toBeNull();
  });
});

describe("parseIdeStorage", () => {
  it("state.code와 state.language를 읽는다", () => {
    const r = parseIdeStorage(fx("ide-storage.json"));
    expect(r?.code).toContain("map(int, input().split())");
    expect(r?.language).toBe("python3");
  });
  it("구조가 다르거나 깨졌으면 null (예비 경로로 넘어가게)", () => {
    expect(parseIdeStorage(null)).toBeNull();
    expect(parseIdeStorage("{oops")).toBeNull();
    expect(parseIdeStorage(JSON.stringify({ code: "x" }))).toBeNull();
    expect(parseIdeStorage(JSON.stringify({ state: { code: 1 } }))).toBeNull();
  });
});

describe("cleanTitle", () => {
  it("사이트 이름을 떼어 낸다", () => {
    expect(cleanTitle("두 개의 격자 비교하기 | 코드트리")).toBe("두 개의 격자 비교하기");
    expect(cleanTitle("코드트리")).toBeNull();
    expect(cleanTitle("")).toBeNull();
  });
});

describe("extractStatement", () => {
  it("제목부터 에디터 코드 앞까지 자른다", () => {
    const code = JSON.parse(fx("ide-storage.json")).state.code as string;
    const s = extractStatement(fx("codetree-noresult.txt"), "두 개의 격자 비교하기", code);
    expect(s.startsWith("두 개의 격자 비교하기")).toBe(true);
    expect(s).toContain("입력 형식");
    expect(s).toContain("1 ≤ n, m ≤ 100");
    expect(s).not.toContain("map(int");
    expect(s).not.toContain("테스트케이스");
  });
  it("코드를 모르면 테스트케이스 라벨 앞에서 자른다", () => {
    const s = extractStatement(fx("codetree-noresult.txt"), null, null);
    expect(s).toContain("출력 형식");
    expect(s).not.toContain("제출 및 채점");
  });
});

describe("parseRunResult", () => {
  it("결과가 없으면 none", () => {
    expect(parseRunResult(fx("codetree-noresult.txt"))).toEqual({ kind: "none" });
  });
  it("나의 출력 = 정답이면 pass (줄 끝 공백 무시)", () => {
    const r = parseRunResult(fx("codetree-pass.txt"));
    expect(r).toMatchObject({ kind: "pass", time: "48ms", memory: "16MB", mine: "0 0\n0 1" });
  });
  it("나의 출력 ≠ 정답이면 mismatch", () => {
    const r = parseRunResult(fx("codetree-mismatch.txt"));
    expect(r).toMatchObject({ kind: "mismatch", mine: "[0, 0]\n[0, 1]", expected: "0 0\n0 1", time: "52ms" });
  });
  it("오류 메시지만 뜨면 error", () => {
    expect(parseRunResult(fx("codetree-error.txt"))).toEqual({
      kind: "error",
      message: "ValueError: not enough values to unpack (expected 2, got 1)",
    });
  });
  it("Traceback은 마지막 오류 줄까지 묶는다", () => {
    const r = parseRunResult(fx("codetree-traceback.txt"));
    expect(r.kind).toBe("error");
    if (r.kind === "error") {
      expect(r.message.startsWith("Traceback")).toBe(true);
      expect(r.message.endsWith("(expected 2, got 1)")).toBe(true);
    }
  });
  it("지시서의 실제 끝부분 예(정답 라벨 없이 수행 시간만)도 통과로 본다", () => {
    const tail = "...\n테스트케이스\n결과\n4 9 14 19 24 \n5 10 15 20 25 \n\n\n상세 정보\n\n수행 시간\n\n48ms\n\n메모리\n\n16MB";
    expect(parseRunResult(tail)).toMatchObject({ kind: "pass", time: "48ms", memory: "16MB" });
  });
  it("문제 본문에 'Error'라는 단어가 있어도 결과 영역 밖이면 무시한다", () => {
    const t = "문제\nValueError: 이런 예외를 내지 마세요\n테스트케이스\n결과\n코드 실행\n\n제출 및 채점";
    expect(parseRunResult(t)).toEqual({ kind: "none" });
  });
});

describe("normalizeOutput", () => {
  it("줄 끝 공백과 끝 빈 줄을 지운다", () => {
    expect(normalizeOutput("1 2 \n3 4  \n\n")).toBe("1 2\n3 4");
  });
});
