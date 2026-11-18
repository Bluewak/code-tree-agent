# 코드트리 학습 서랍

코드트리(codetree.ai) 문제 페이지 위에 여닫는 서랍형 크롬 확장(Manifest V3). 서버 없음.

- 코드 전에 6개 질문에 답한다 (질문마다 힌트·건너뛰기)
- 풀이 과정은 브라우저 안(`chrome.storage.local`)의 "내 기록"에 저장된다
- LLM은 사용자가 자기 Claude API 키로 연결한다

구현 지시서: [docs/BUILD_BRIEF.md](docs/BUILD_BRIEF.md)

## 설치 (개발용)

```bash
npm install
npm run build
```

1. 크롬에서 `chrome://extensions` → 오른쪽 위 "개발자 모드" 켜기
2. "압축해제된 확장 프로그램을 로드합니다" → `dist/` 폴더 선택
3. 확장 아이콘 오른쪽 클릭 → "옵션"(또는 서랍의 설정 → "키 넣기")에서 Claude API 키를 넣고 "연결 확인"
4. 코드트리 문제 페이지를 새로고침 → 오른쪽 가장자리의 `<` 손잡이 클릭 (또는 `Alt+Q`)

## 지금 되는 것 (M0~M5)

- 문제 제목·본문 읽기, 손잡이와 서랍(열기/닫기, 위치, 단축키)
- 풀기 전: 6개 질문 채점·힌트·건너뛰기, 자유 질문
- 막혔을 때: 실행 결과 감지(오류 / 출력 불일치 / 통과), 나의 출력과 정답 나란히, 힌트 사다리 4단계, 코드 리뷰 3항목
- 풀고 난 뒤: 걸린 질문 6칸, 끝내기
- 내 기록: 자동 저장, 보기, 글로 복사하기
- 아직 없음: 몰랐던 것·개념·다시 풀기(M6), 다른 연결 방식(M7)

## 명령

| 명령 | 하는 일 |
|---|---|
| `npm run build` | `dist/` 생성 |
| `npm run watch` | 고칠 때마다 다시 빌드 |
| `npm run test` | 단위 테스트 (vitest) |
| `npm run lint` / `npm run typecheck` | 린트 / 타입 검사 |
| `npm run check` | 위 넷을 순서대로 |
| `npm run e2e` | 가짜 코드트리 페이지와 가짜 API 응답으로 브라우저 확인 (Playwright 필요, 실제 사이트·API에 접속하지 않음) |

## 문서

- [docs/DECISIONS.md](docs/DECISIONS.md): 결정 사항
- [docs/CHANGELOG.md](docs/CHANGELOG.md): 단계별 변경 내역
- [docs/USER_CHECKS.md](docs/USER_CHECKS.md): 사용자 확인 필요 목록
