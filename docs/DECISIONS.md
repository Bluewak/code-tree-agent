# 결정 사항

## M0

- **빌드: Vite 대신 esbuild 직접 사용.** 확장은 진입점이 4개(백그라운드, 콘텐츠, 메인 월드, 설정 페이지)이고, 콘텐츠·메인 월드 스크립트는 ES 모듈로 실을 수 없어 IIFE 한 파일이어야 한다. Vite의 라이브러리 모드는 IIFE 진입점을 하나만 받으므로 설정이 복잡해진다. esbuild는 진입점마다 형식을 정할 수 있고 빌드가 1초 안에 끝난다. 테스트는 vitest(내부적으로 Vite)를 쓴다.
- **UI: Preact.** 화면 5개와 상태 전환이 있어 순수 TS보다 짧고, 번들이 작다(약 10KB).
- **글꼴:** `@fontsource/ibm-plex-sans-kr`(400, 600), `@fontsource/ibm-plex-mono`(400, 라틴)의 woff2를 `dist/fonts/`에 넣어 배포한다. 페이지 글꼴과 충돌하지 않게 `CSA Plex Sans KR`, `CSA Plex Mono`로 이름을 바꿔 등록한다. Shadow DOM 안의 `@font-face`는 크롬에서 적용되지 않으므로 `@font-face`만 문서 `<head>`에 넣는다.
- **아이콘:** 빌드 스크립트가 PNG를 직접 만든다(초록 바탕에 흰 `<`). 외부 이미지 파일 없음.
- **최소 크롬 버전 111:** 콘텐츠 스크립트의 `world: "MAIN"` 지원 때문.

## M1

- **읽기 모듈 구조:** `src/sites/types.ts`(사이트 공통 모양) / `src/sites/codetree/parse.ts`(화면 글자를 해석하는 순수 함수, 표본으로 테스트) / `src/sites/codetree/reader.ts`(DOM 접근). 코드트리 내부 구조(`ide-storage`, 라벨 글자)에 기대는 코드는 이 두 파일에만 있다. 백준·LeetCode는 `src/sites/<site>/`에 같은 모양으로 추가한다.
- **코드 읽기 순서:** `localStorage["ide-storage"]` → 실패하면 메인 월드 스크립트(`src/mainworld/`)에 `postMessage`로 물어 Monaco의 `getValue()` 값을 받는다. 메인 월드 스크립트는 값을 읽기만 한다.
- **기다리기:** `MutationObserver`로 화면 글자가 600ms 동안 바뀌지 않을 때 읽는다(최대 15초).
- **본문 자르기:** 제목이 처음 나오는 곳부터, 에디터 코드 첫 줄 또는 "테스트케이스" 라벨 앞까지. 8000자 넘으면 자른다.
- **실행 결과(M5에서 화면에 씀, 해석은 미리 구현):** 마지막 "테스트케이스" 라벨 뒤만 본다. 오류 줄(`...Error:`, Traceback, 컴파일/런타임 에러) → `error`, "나의 출력"과 "정답"이 있으면 비교해 `pass`/`mismatch`(줄 끝 공백 무시), "수행 시간"만 있으면 `pass`.
- **Shadow DOM은 open 모드.** closed로 해도 페이지 스크립트가 `attachShadow`를 먼저 가로채면 열 수 있어 실익이 없고, open이어야 Playwright 확인 테스트가 안을 읽을 수 있다. 서랍 DOM에는 API 키가 들어가지 않는다(키 입력은 확장 설정 페이지에서만).
- **겹치기:** 호스트 요소는 크기 0의 `position: fixed`. 손잡이와 서랍만 `position: fixed`로 그린다. 페이지 CSS를 바꾸지 않는다.
- **닫기:** Esc(창 캡처 단계), 바깥 `pointerdown`(이벤트 경로에 서랍 호스트가 없으면 닫음), 닫기 버튼, 단축키.
- **단축키:** `chrome.commands`(기본 `Alt+Q`). 백그라운드가 받아 탭에 `drawer.toggle`을 보낸다. 사용자는 `chrome://extensions/shortcuts`에서 바꿀 수 있다.
- **손잡이 숨기기:** 툴바 아이콘 클릭 → 설정 `handleHidden` 토글. 숨겨도 단축키로는 열린다.
- **SPA 이동:** 0.8초마다 주소를 비교해 바뀌면 문제를 다시 읽는다.
- **키 입력 격리:** 서랍 안의 키 이벤트는 Shadow DOM 밖으로 전파하지 않는다(코드트리 단축키 오작동 방지). Esc만 예외.
