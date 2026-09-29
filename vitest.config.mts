// vitest 설정 (node 환경에서 순수 로직과 렌더러를 검증)
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { environment: "node", include: ["lib/**/*.test.ts"] },
});
