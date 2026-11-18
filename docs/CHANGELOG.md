# 변경 내역

## M0: 저장소 뼈대 (2026-11-18)

- TypeScript + esbuild 빌드, ESLint, vitest, tsc 설정
- MV3 매니페스트: 백그라운드 서비스 워커, 콘텐츠 스크립트(격리 월드 + 메인 월드), 설정 페이지, 단축키 `Alt+Q`, 글꼴 리소스
- 확인: `npm run check` 통과. Playwright Chromium(headless)에 `dist/`를 불러와 서비스 워커가 뜨고 설정 페이지가 열리는 것을 확인

## M1: 코드트리 읽기 + 손잡이와 빈 서랍 (2026-11-18)

- 읽기 모듈: 문제 ID(URL), 제목, 본문, KaTeX 수식, 코드·언어(ide-storage → Monaco 예비 경로), 실행 결과 3종 해석
- 표본 6개(`tests/fixtures/`, 지시서 3번 구조대로 만든 것)와 단위 테스트 16개
- 손잡이(28×64, `<`), 서랍(420px, 페이지 위에 겹침), 탭 3개(빈 화면), Esc/바깥 클릭/단축키/닫기 버튼, 툴바 아이콘으로 손잡이 숨기기
- 글꼴(IBM Plex Sans KR / Mono) 배포
- 확인: `npm run check` 통과. `npm run e2e`(가짜 코드트리 페이지 + headless Chromium)에서 9개 항목 통과: 손잡이 크기·위치, 서랍 폭, 제목·본문 표시, 서랍을 열어도 페이지 버튼 위치 그대로, Esc/바깥 클릭으로 닫힘, 손잡이 숨기기/보이기
- 확인 못 함: 실제 코드트리 페이지에서의 동작(이 환경에서 codetree.ai 접속이 막혀 있음)

## M2: LLM 연결부 + Claude API 키 + 설정 화면 (2026-11-18)

- 연결부 인터페이스(`src/llm/types.ts`), Claude API 연결(`src/llm/claude.ts`), 방식 고르기(`src/llm/registry.ts`), 테스트용 가짜 연결(`src/llm/fake.ts`)
- 키 보관(`src/storage/secrets.ts`), 백그라운드 요청: 연결 상태, 연결 확인, 키 저장
- 확장 설정 페이지: 연결 방식(Claude API 키만 켜짐, 나머지 "준비 중"), 키 입력·저장·지우기, 모델 선택, 연결 확인
- 서랍 설정 화면: 계정 연결 상태, 서랍 위치(왼쪽/오른쪽), 단축키 표시·바꾸기, 6개 질문 켜고 끄기
- 테스트 8개 추가(가짜 fetch로 요청 모양·오류 분류 확인). 브라우저 확인 7개 항목 추가(가짜 API 응답)
- 확인 못 함: 실제 키로 Claude API 호출(자동 테스트에서 실제 키를 쓰지 않음)
