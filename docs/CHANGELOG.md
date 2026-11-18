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
