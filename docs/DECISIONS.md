# 결정 사항

## M0

- **빌드: Vite 대신 esbuild 직접 사용.** 확장은 진입점이 4개(백그라운드, 콘텐츠, 메인 월드, 설정 페이지)이고, 콘텐츠·메인 월드 스크립트는 ES 모듈로 실을 수 없어 IIFE 한 파일이어야 한다. Vite의 라이브러리 모드는 IIFE 진입점을 하나만 받으므로 설정이 복잡해진다. esbuild는 진입점마다 형식을 정할 수 있고 빌드가 1초 안에 끝난다. 테스트는 vitest(내부적으로 Vite)를 쓴다.
- **UI: Preact.** 화면 5개와 상태 전환이 있어 순수 TS보다 짧고, 번들이 작다(약 10KB).
- **글꼴:** `@fontsource/ibm-plex-sans-kr`(400, 600), `@fontsource/ibm-plex-mono`(400, 라틴)의 woff2를 `dist/fonts/`에 넣어 배포한다. 페이지 글꼴과 충돌하지 않게 `CSA Plex Sans KR`, `CSA Plex Mono`로 이름을 바꿔 등록한다. Shadow DOM 안의 `@font-face`는 크롬에서 적용되지 않으므로 `@font-face`만 문서 `<head>`에 넣는다.
- **아이콘:** 빌드 스크립트가 PNG를 직접 만든다(초록 바탕에 흰 `<`). 외부 이미지 파일 없음.
- **최소 크롬 버전 111:** 콘텐츠 스크립트의 `world: "MAIN"` 지원 때문.
