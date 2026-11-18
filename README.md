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
3. 코드트리 문제 페이지를 새로고침 → 오른쪽 가장자리의 `<` 손잡이 클릭 (또는 `Alt+Q`)

## 명령

| 명령 | 하는 일 |
|---|---|
| `npm run build` | `dist/` 생성 |
| `npm run watch` | 고칠 때마다 다시 빌드 |
| `npm run test` | 단위 테스트 (vitest) |
| `npm run lint` / `npm run typecheck` | 린트 / 타입 검사 |
| `npm run check` | 위 넷을 순서대로 |

## 문서

- [docs/DECISIONS.md](docs/DECISIONS.md): 결정 사항
- [docs/CHANGELOG.md](docs/CHANGELOG.md): 단계별 변경 내역
- [docs/USER_CHECKS.md](docs/USER_CHECKS.md): 사용자 확인 필요 목록
