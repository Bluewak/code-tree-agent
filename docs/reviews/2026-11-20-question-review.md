# 6칸 질문 개편안 검토 문답 (2026-11-20)

사용자 요청: "Codex와 함께 문답으로 스키마와 지금 정합성을 검토해 줘. 손풀이와 6번(경계)이 맞는지, 알고리즘 풀이 순서로 적합한지."

- 검토자 1: Claude Fable (하위 에이전트, 결론 없이 자료만 주고 2회 문답)
- 검토자 2: OpenAI Codex CLI 0.171.0 (사용자 ChatGPT 구독으로 로그인, 저장소 읽기 전용 샌드박스, 2회 문답)
- 아래는 Codex 답 원문이다. Fable 문답 요약과 최종 합의는 이 문서 끝에 있다.

## Codex 1차 답
**순서는 채택해도 된다.** 입력 → 출력 → 손풀이(q4) → 규칙(q3) → 구조 → 경계가 자연스럽다. 다만 숫자와 이름만으로 손풀이와 규칙을 구분한다는 Fable의 판단에는 동의하지 않는다. **손풀이는 한 입력에서 무엇이 바뀌었는지, 규칙은 임의의 입력에서 무엇을 하면 답이 나오는지**로 채점해야 한다. 경계는 최종 뼈대의 어느 부분이 틀리기 쉬운지 검증하는 칸이다.

### Fable 결론에서 수정할 점

- **손풀이와 규칙은 채점 기준으로 가른다.** 두 용액에서 `-5 1 3 → 합 -4, -2, 4 → -5 3`은 손풀이다. “모든 쌍을 비교해 합의 절댓값이 가장 작은 쌍을 고른다”는 규칙이다. 문제 상수인 0·45나 출력값 0·1은 규칙에서도 허용해야 한다. 별 찍기처럼 출력과 규칙이 실제로 겹치면 앞 답이 절차까지 담았을 때 재사용을 인정한다. [QUESTION_EXAMPLES.md:38](/home/user/code-tree-agent/docs/QUESTION_EXAMPLES.md:38) · [QUESTION_EXAMPLES.md:93](/home/user/code-tree-agent/docs/QUESTION_EXAMPLES.md:93) · [QUESTION_EXAMPLES.md:210](/home/user/code-tree-agent/docs/QUESTION_EXAMPLES.md:210)
- **‘평범한 입력’은 손풀이의 기본값이면 충분하다.** 배낭에서 탐욕법이 틀리는 작은 예는 손풀이로 가치가 있다. 반대로 알람 예시는 손풀이와 경계에 같은 `0 30 → 23 45`를 썼다. 같은 입력을 쓰더라도 경계에서 “시를 하나 줄이는 분기에서 `-1`시가 나올 수 있다”까지 요구해야 새 검증이 된다. 구조를 건너뛰었다면 검증할 분기나 구현 가정을 먼저 한 줄로 적게 한다. [QUESTION_EXAMPLES.md:100](/home/user/code-tree-agent/docs/QUESTION_EXAMPLES.md:100) · [QUESTION_EXAMPLES.md:190](/home/user/code-tree-agent/docs/QUESTION_EXAMPLES.md:190)
- **시간 판단을 구조에 모으는 데 동의한다.** 다만 반복문 횟수에 한정하면 문자열 뒤집기·비교나 재귀 탐색 비용을 놓친다. 최대 입력에서 실제 작업량을 보고, 줄여야 하면 무엇을 왜 생략할 수 있는지와 바꾼 뒤 비용을 묻는 편이 낫다. [QUESTION_EXAMPLES.md:77](/home/user/code-tree-agent/docs/QUESTION_EXAMPLES.md:77) · [QUESTION_EXAMPLES.md:218](/home/user/code-tree-agent/docs/QUESTION_EXAMPLES.md:218) · [QUESTION_EXAMPLES.md:229](/home/user/code-tree-agent/docs/QUESTION_EXAMPLES.md:229)

### 코드와 기록에서 걸리는 곳

- **진행과 채점 문맥.** `currentQ`는 q 번호를 정렬하지 않고 세션 배열에서 첫 미해결 칸을 찾는다. 초기 배열은 `QUESTIONS` 순서다. 화면 목록만 바꾸면 진행은 그대로이고, `QUESTIONS`를 재배열하면 `p.q < cur`로 접힘을 판단하는 코드와 `p.q < progress.q`로 앞 답을 고르는 코드가 어긋난다. q3 채점에 직전 q4 답이 빠지고, 카드 번호도 `4 / 6` 다음에 `3 / 6`으로 표시된다. [questions.ts:80](/home/user/code-tree-agent/src/core/questions.ts:80) · [session.ts:57](/home/user/code-tree-agent/src/core/session.ts:57) · [BeforeView.tsx:72](/home/user/code-tree-agent/src/ui/BeforeView.tsx:72) · [BeforeView.tsx:134](/home/user/code-tree-agent/src/ui/BeforeView.tsx:134) · [BeforeView.tsx:164](/home/user/code-tree-agent/src/ui/BeforeView.tsx:164)
- **저장·6칸·글 출력.** `sessionToRecord`는 세션 배열 순서로 저장하고, 검증기는 정확히 여섯 칸과 `q === i + 1`을 요구한다. 세션을 `1,2,4,3,5,6`으로 저장하면 저장 단계에서 거절된다. `Cells`와 마크다운은 받은 배열 순서대로 표시하며 `QUESTIONS[q-1]`로 이름을 찾는다. `QUESTIONS`를 재배열하면 q3·q4 이름이 뒤바뀌고, 마크다운의 ‘자주 걸린 질문’도 배열 인덱스로 통계를 붙여 어긋난다. `Cells`는 내 기록과 풀이 후 화면이 공유한다. [records.ts:35](/home/user/code-tree-agent/src/storage/records.ts:35) · [records.ts:78](/home/user/code-tree-agent/src/storage/records.ts:78) · [schema.ts:96](/home/user/code-tree-agent/src/storage/schema.ts:96) · [RecordsView.tsx:12](/home/user/code-tree-agent/src/ui/RecordsView.tsx:12) · [AfterView.tsx:30](/home/user/code-tree-agent/src/ui/AfterView.tsx:30) · [records.ts:147](/home/user/code-tree-agent/src/storage/records.ts:147) · [records.ts:179](/home/user/code-tree-agent/src/storage/records.ts:179)
- **채점과 공개.** 현재 응답은 `{pass, feedback}`이고, 통과 시 보완 내용을 추가하지 말라고 한다. 오답 뒤 통과·건너뛰기도 `failed`로 남으며 세 번째 오답 종료는 없다. 접힌 행은 요약 유무로 통과·건너뜀만 표시하므로 강제 종료 시 공개한 답을 볼 상태가 필요하다. 공개 답이 학생의 통과 답으로 다음 채점에 들어가지 않도록 문맥도 구분해야 한다. 기존 문제 정답용 4단계 힌트는 해당 칸 답 공개에 그대로 쓰기 어렵다. 지시서 2·4절의 응답 형식과 오답 피드백 규칙도 함께 개정해야 한다. [tasks.ts:62](/home/user/code-tree-agent/src/core/tasks.ts:62) · [tasks.ts:93](/home/user/code-tree-agent/src/core/tasks.ts:93) · [tasks.ts:116](/home/user/code-tree-agent/src/core/tasks.ts:116) · [session.ts:70](/home/user/code-tree-agent/src/core/session.ts:70) · [BeforeView.tsx:102](/home/user/code-tree-agent/src/ui/BeforeView.tsx:102) · [BUILD_BRIEF.md:32](/home/user/code-tree-agent/docs/BUILD_BRIEF.md:32) · [BUILD_BRIEF.md:76](/home/user/code-tree-agent/docs/BUILD_BRIEF.md:76)
- **힌트 집계.** `addHint`는 칸별 힌트도 전역 `maxLevel`에 넣고, 4단계면 `answerRevealed`를 켠다. 두 필드 모두 문제 전체 힌트에만 반영해야 한다. `isTouched`도 전역 힌트 값에 의존하므로, 칸 힌트만 본 세션의 자동 저장을 유지하려면 `q.hints`를 직접 확인해야 한다. [session.ts:98](/home/user/code-tree-agent/src/core/session.ts:98) · [records.ts:30](/home/user/code-tree-agent/src/storage/records.ts:30) · [App.tsx:65](/home/user/code-tree-agent/src/ui/App.tsx:65)

**v1 판정.** JSON 키·값 범위와 저장 순서를 유지하면 지시서 6절의 명시적 형식과 충돌하지 않는다. 다만 질문 정의와 `failed`·힌트 집계의 의미가 바뀐다. Fable이 말한 칸별 힌트·시도 횟수와 질문 세트 표식은 기존 풀이 JSON에도 없었다. 실제로 잃는 것은, 재시도 후 통과를 `passed`로 바꿀 경우 **한 번이라도 막힌 칸을 세던 지표**다. 참고로 6절은 힌트 값 범위를 명시하지만 문제 전체 전용이라는 뜻은 적어 두지 않았으므로 개정 시 명문화하는 편이 좋다. [BUILD_BRIEF.md:97](/home/user/code-tree-agent/docs/BUILD_BRIEF.md:97) · [BUILD_BRIEF.md:133](/home/user/code-tree-agent/docs/BUILD_BRIEF.md:133) · [records.ts:47](/home/user/code-tree-agent/src/storage/records.ts:47) · [records.ts:143](/home/user/code-tree-agent/src/storage/records.ts:143)

### 최종 권고

| 항목 | 권고 |
|---|---|
| 순서·표시 | `1→2→4→3→5→6`을 진행·화면·글 출력에 공통 적용한다. 이름과 상태는 q로 찾고 JSON 배열은 `1~6` 순서로 저장한다. |
| 입력·출력 | 입력은 줄 구성·종류·이름·범위, 출력은 줄·개수·구분·특수값을 확인한다. |
| 손풀이·규칙 | 손풀이는 작은 유효 입력의 중간 상태와 답, 규칙은 임의 입력에 적용 가능한 절차를 요구한다. 느린 절차도 허용한다. |
| 구조·경계 | 구조에서 최대 작업량·필요한 개선·최종 뼈대를 확인한다. 경계는 구체 입력·위험한 지점·기대 답을 요구한다. 최소 입력에서 반복이 한 번만 도는지 확인하는 것도 유효하다. |
| 채점 | 통과와 보완 통과는 `passed`, 세 번째 오답은 칸 답을 남겨 볼 수 있게 하고 `failed`로 종료한다. 재시도 후 통과와 오답 후 건너뛰기의 저장 상태를 명시하고 통계 문구도 맞춘다. |
| v1·전환 | 기존 데이터가 폐기 가능한 시험 기록이면 v1을 유지한다. 문서에 개정일과 의미 변경을 적고, 사용자가 첫 사용 전에 `records`와 `active`를 함께 지운다. 현재 전체 삭제가 두 저장소를 비우며, 구 v1은 검증만으로 걸러지지 않는다. [records.ts:120](/home/user/code-tree-agent/src/storage/records.ts:120) · [schema.ts:78](/home/user/code-tree-agent/src/storage/schema.ts:78) |

정적 검토만 했으며 파일은 수정하지 않았다.

## Codex 2차 답 (설계자 반박: failed 의미, 손풀이/규칙 쓰는 틀, 경계 한 줄 틀)

1. **v1 유지에 동의한다.** 재시도 뒤에도 `failed`를 유지하면 ‘한 번이라도 막힌 칸’ 지표는 보존된다. 앞서 언급한 지표 손실은 이 전제에선 없다. 복습할 지점을 찾는 목적이라면 지금 의미가 적합하다. 다만 기록에서 ‘결국 스스로 통과’, ‘건너뜀’, ‘답 공개로 종료’는 같은 `failed`로 남는다. 학습 진전까지 보려면 두 정보가 모두 필요하다. 화면의 ‘걸림’은 현재 의미에 맞다. [session.ts:70](/home/user/code-tree-agent/src/core/session.ts:70) · [RecordsView.tsx:10](/home/user/code-tree-agent/src/ui/RecordsView.tsx:10)

2. **손풀이·규칙 쓰는 틀**

   | 칸 | 쓰는 틀 | 채점 기준 |
   |---|---|---|
   | 손풀이 | `작은 입력 … → 실제 값으로 계산하거나 비교한 과정 … → 답 …` | 답을 만든 핵심 중간 단계와 최종 답이 맞으면 통과. |
   | 규칙 | `입력이 100배 커져도 같은 방식으로 따라 할 수 있게, 입력에 붙인 이름으로 “무엇을 어떻게 하면 답이 나오는지” 한 문장으로 쓰세요.` | 임의의 유효 입력에 따라 하면 답이 나오면 통과. 느린 절차도 되고, 문제의 상수(0, 45)와 출력값(0/1)도 써도 된다. |

3. **구조를 건너뛴 경우에도 한 줄이면 된다.** 쓰는 틀은 `입력 … → …할 때 … 실수하기 쉬움 → 정답 …`.  
   모범 답은 `0 30 → 분이 모자라 시를 하나 줄일 때 -1시로 쓰기 쉬움 → 정답 23 45`.

## Fable 문답 요약
- 1차: 순서는 적합. 시간 판단은 구조 칸에만. 손풀이와 경계는 지금 틀로는 같은 활동이므로 입력 고르는 기준(평범 vs 깨려고)과 채점 대상(과정 vs 왜 이 입력인가)으로 가른다. "특별히 없음"은 없앤다. 스키마는 q 번호 유지 + 화면 순서만 변경은 문서화로 충분, 질문 의미가 바뀌므로 예전 기록과 q별 통계를 섞으면 안 된다. 칸별 힌트를 hints.maxLevel에 섞는 동작은 지시서와 어긋난다.
- 2차(설계자 반박 후): 규칙 칸 = "손으로 한 절차를 그대로 한 문장"(느려도 통과, 답의 성질만 말하면 다시). v2 없이 지시서 표 개정 + 기록 폐기에 동의(개정일 한 줄 남기기). 손풀이 과정은 한 줄로 충분, 대신 손풀이는 숫자·규칙은 이름으로 가른다.

## 합의 (두 검토자 + 설계자)

| 항목 | 결정 |
|---|---|
| 순서 | 입력 → 출력 → 손풀이(q4) → 규칙(q3) → 구조 → 경계. 진행·화면·6칸·글 출력에 공통 적용. JSON 배열은 q 1~6 순서 그대로 |
| 손풀이 | 작은 입력 → 실제 값으로 계산·비교한 과정 한 줄 → 답. 채점: 핵심 중간 단계와 답이 맞는가 |
| 규칙 | 입력이 100배 커져도 따라 할 수 있게, 입력 칸의 이름으로 "무엇을 어떻게 하면 답이 나오는지" 한 문장. 느린 절차, 문제 상수(0, 45), 출력값(0/1) 허용. 채점: 임의의 입력에 따라 하면 답이 나오는가 |
| 구조 | 최대 입력에서 실제 작업량(반복 횟수만이 아니라 뒤집기·비교·재귀 비용 포함) → 되나 → 안 되면 무엇을 왜 줄이나와 바꾼 뒤 비용 → 뼈대 |
| 경계 | 입력 → 어디서 실수하기 쉬운가 → 정답. 예: `0 30 → 분이 모자라 시를 하나 줄일 때 -1시로 쓰기 쉬움 → 정답 23 45`. "특별히 없음" 없음 |
| failed 의미 | "한 번이라도 막힌 칸"을 유지. 한계: 결국 통과 / 건너뜀 / 답 공개 종료가 같은 failed로 남는다(v1에서는 감수) |
| 스키마 | v1 유지. 지시서 4·6절과 2·4절(채점 응답 형식, 피드백 규칙) 개정, 개정일·이전 기록 폐기 한 줄. 사용자가 records·active를 함께 지움("모든 기록 지우기") |
| hints | 문제 전체 힌트 사다리 전용. 칸별 힌트는 maxLevel·answerRevealed에 넣지 않는다. isTouched는 칸별 힌트를 직접 확인 |

## 코드에 반영할 때 고칠 곳 (Codex 지적)
- 진행: `currentQ`가 배열 첫 미해결 칸을 찾음, 접힘 판단(`p.q < cur`)과 앞 답 고르기(`p.q < progress.q`)가 q 번호 비교 → 화면 순서 기준으로
- 카드 번호 표시 `q / 6` → 화면 순서 번호로
- 저장 배열은 q 1~6 순서 유지(검증기가 `q === i + 1` 요구). 6칸·글 출력·"자주 걸린 질문" 통계는 q로 이름을 찾고 화면 순서로 표시
- 채점 응답 형식에 판정 3단계와 보완점, 3번째 오답 종료와 칸 답 보관(다음 채점의 "앞 답"에 공개 답이 학생 답처럼 들어가지 않게 구분)
- `addHint`의 전역 반영 제거, `isTouched` 수정
