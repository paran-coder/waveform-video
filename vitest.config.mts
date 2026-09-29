// vitest 설정 (순수 로직과 렌더러는 node, 화면 테스트는 파일 상단 주석으로 jsdom 사용)
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: { environment: "node", include: ["lib/**/*.test.ts", "components/**/*.test.tsx"] },
});
