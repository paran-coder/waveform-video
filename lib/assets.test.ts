// 큰 이미지를 줄이는 비율 계산이 맞는지 확인하는 테스트
import { describe, expect, it } from "vitest";
import { fitScale } from "./assets";

describe("fitScale", () => {
  it("작은 이미지는 그대로 둔다", () => {
    expect(fitScale(800, 600, 1024)).toBe(1);
    expect(fitScale(1024, 1024, 1024)).toBe(1);
  });
  it("긴 변이 최대값이 되도록 줄인다", () => {
    expect(fitScale(4000, 2000, 1000)).toBe(0.25);
    expect(fitScale(1000, 8000, 1024)).toBeCloseTo(0.128, 3);
  });
});
