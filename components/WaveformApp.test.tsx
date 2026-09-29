// @vitest-environment jsdom
// 메인 화면이 오류 없이 그려지고, 요청에 따라 제목 텍스트가 없고 음원 없이는 내보내기가 막히는지 확인하는 화면 테스트
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import WaveformApp from "./WaveformApp";

afterEach(cleanup);

describe("WaveformApp", () => {
  it("왼쪽 위에 '파형 영상 만들기' 제목을 표시하지 않는다", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    render(<WaveformApp />);
    expect(screen.queryByText("파형 영상 만들기")).toBeNull();
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
  });

  it("음원이 없으면 재생과 내보내기가 비활성화되고 설정 탭이 보인다", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    render(<WaveformApp />);
    expect((screen.getByRole("button", { name: "재생" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: /MP4로 내보내기/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getAllByRole("tab")).toHaveLength(6);
    expect(screen.getByText("음원 파일 선택")).toBeTruthy();
  });
});
