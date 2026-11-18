# 변경 내역

## M0: 저장소 뼈대 (2026-11-18)

- TypeScript + esbuild 빌드, ESLint, vitest, tsc 설정
- MV3 매니페스트: 백그라운드 서비스 워커, 콘텐츠 스크립트(격리 월드 + 메인 월드), 설정 페이지, 단축키 `Alt+Q`, 글꼴 리소스
- 확인: `npm run check` 통과. Playwright Chromium(headless)에 `dist/`를 불러와 서비스 워커가 뜨고 설정 페이지가 열리는 것을 확인
