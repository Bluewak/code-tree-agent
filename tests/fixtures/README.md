# 표본 (fixture)

실제 페이지에서 저장한 것이 아니라, docs/BUILD_BRIEF.md 3번의 "확인된 구조"대로 만든 표본이다.
실제 코드트리 페이지의 innerText를 저장해 여기에 추가하면 테스트가 실제 모양을 따라간다.
(저장 방법: 문제 페이지 개발자 도구 콘솔에서 `copy(document.body.innerText)` 후 붙여넣기)
