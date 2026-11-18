// 테스트용 가짜 연결. 실제 키로 호출하는 테스트는 자동으로 돌리지 않는다.

import type { CompleteRequest, LlmProvider } from "./types";

export function createFakeProvider(respond: (req: CompleteRequest) => string | Promise<string>) {
  const calls: CompleteRequest[] = [];
  const provider: LlmProvider & { calls: CompleteRequest[] } = {
    id: "claude-api",
    calls,
    async complete(req) {
      calls.push(req);
      return respond(req);
    },
  };
  return provider;
}
