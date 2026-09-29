// @vitest-environment jsdom
// 설정 패널의 탭 전환, 스위치, 로고 위치 선택, 프리셋 적용, 내보내기 옵션이 동작하는지 검증하는 화면 테스트
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BUILTIN_PRESETS, DEFAULT_SETTINGS } from "@/lib/settings";
import SettingsPanel from "./SettingsPanel";

afterEach(cleanup);

function setup(over: Partial<Parameters<typeof SettingsPanel>[0]> = {}) {
  const fn = {
    set: vi.fn(),
    setArt: vi.fn(),
    setLogo: vi.fn(),
    onAsset: vi.fn(),
    setTl: vi.fn(),
    setOut: vi.fn(),
    onSavePreset: vi.fn(),
    onLoadPreset: vi.fn(),
    onDeletePreset: vi.fn(),
    onExportJson: vi.fn(),
    onImportJson: vi.fn(),
  };
  const props = {
    s: DEFAULT_SETTINGS,
    assetNames: {},
    audioDuration: 120,
    outDuration: 120,
    tl: { start: 0, end: 120, fadeIn: 0, fadeOut: 0 },
    out: { includeAudio: true, format: "mp4" as const, keyColor: "black" as const },
    presets: {},
    supportMsg: null,
    ...fn,
    ...over,
  };
  render(<SettingsPanel {...props} />);
  return fn;
}

const tab = (name: string) => screen.getByRole("tab", { name });

describe("SettingsPanel", () => {
  it("탭은 6개이고 눌러서 전환할 수 있다", () => {
    setup();
    expect(screen.getAllByRole("tab")).toHaveLength(6);
    expect(tab("파형").getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("저음 반응")).toBeTruthy();
    fireEvent.click(tab("화면"));
    expect(tab("화면").getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("화면 비율")).toBeTruthy();
    expect(screen.queryByText("저음 반응")).toBeNull();
  });

  it("파형 종류를 고르면 set이 호출된다", () => {
    const fn = setup();
    fireEvent.click(screen.getByRole("radio", { name: /원형/ }));
    expect(fn.set).toHaveBeenCalledWith({ waveType: "circle" });
  });

  it("제목·아티스트 스위치를 끄면 textOn false가 전달되고, 꺼지면 입력칸이 비활성화된다", () => {
    const fn = setup();
    fireEvent.click(tab("글자·이미지"));
    fireEvent.click(screen.getByRole("switch", { name: "제목·아티스트 표시" }));
    expect(fn.set).toHaveBeenCalledWith({ textOn: false });
    cleanup();
    setup({ s: { ...DEFAULT_SETTINGS, textOn: false } });
    fireEvent.click(tab("글자·이미지"));
    expect((screen.getByLabelText("제목") as HTMLInputElement).disabled).toBe(true);
  });

  it("로고 위치를 6개 모서리 중에서 고를 수 있고 기본값은 왼쪽 위다", () => {
    const fn = setup();
    fireEvent.click(tab("글자·이미지"));
    const group = screen.getByRole("radiogroup", { name: "위치" });
    expect(within(group).getAllByRole("radio")).toHaveLength(6);
    expect(within(group).getByRole("radio", { name: "왼쪽 위" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(within(group).getByRole("radio", { name: "오른쪽 아래" }));
    expect(fn.setLogo).toHaveBeenCalledWith({ anchor: "br" });
  });

  it("프리셋 탭에 기본 프리셋 12종 이상이 보이고 누르면 적용된다", () => {
    const fn = setup();
    fireEvent.click(tab("프리셋"));
    const buttons = screen.getAllByRole("button", { name: /프리셋 적용/ });
    expect(buttons.length).toBeGreaterThanOrEqual(12);
    fireEvent.click(screen.getByRole("button", { name: "오로라 프리셋 적용" }));
    expect(fn.onLoadPreset).toHaveBeenCalledWith(BUILTIN_PRESETS.find((b) => b.name === "오로라")!.patch);
  });

  it("내 프리셋을 저장하고 삭제할 수 있다", () => {
    const fn = setup({ presets: { 내설정: DEFAULT_SETTINGS } });
    fireEvent.click(tab("프리셋"));
    const save = screen.getByRole("button", { name: "저장" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("현재 설정을 저장"), { target: { value: "새 프리셋" } });
    fireEvent.click(save);
    expect(fn.onSavePreset).toHaveBeenCalledWith("새 프리셋");
    fireEvent.click(screen.getByRole("button", { name: "삭제" }));
    expect(fn.onDeletePreset).toHaveBeenCalledWith("내설정");
  });

  it("내보내기 탭에서 음원 포함을 끌 수 있다", () => {
    const fn = setup();
    fireEvent.click(tab("내보내기"));
    const sw = screen.getByRole("switch", { name: "음원 포함" });
    expect(sw.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(sw);
    expect(fn.setOut).toHaveBeenCalledWith({ includeAudio: false });
  });

  it("출력 형식을 투명 PNG나 합성용 MP4로 바꿀 수 있고 형식별 안내가 나온다", () => {
    const fn = setup();
    fireEvent.click(tab("내보내기"));
    expect(screen.getAllByRole("radio", { name: /PNG|MP4|MOV/ }).length).toBeGreaterThanOrEqual(4);
    fireEvent.click(screen.getByRole("radio", { name: "투명 MOV (한 파일, 알파 포함)" }));
    expect(fn.setOut).toHaveBeenCalledWith({ format: "mov" });
    fireEvent.click(screen.getByRole("radio", { name: "투명 PNG 시퀀스 (ZIP)" }));
    expect(fn.setOut).toHaveBeenCalledWith({ format: "png" });
    cleanup();
    setup({ out: { includeAudio: true, format: "png", keyColor: "black" } });
    fireEvent.click(tab("내보내기"));
    expect(screen.getByText(/완전히 투명한 PNG/)).toBeTruthy();
    expect(screen.getByRole("switch", { name: "음원 포함" }).getAttribute("aria-describedby")).toBeTruthy();
    expect(screen.getByText("ZIP 안에 audio.wav가 함께 들어갑니다.")).toBeTruthy();
    cleanup();
    const fn2 = setup({ out: { includeAudio: true, format: "key", keyColor: "black" } });
    fireEvent.click(tab("내보내기"));
    fireEvent.click(screen.getByRole("radio", { name: "초록" }));
    expect(fn2.setOut).toHaveBeenCalledWith({ keyColor: "green" });
  });

  it("투명 MOV를 고르면 안내와 예상 용량이 나온다", () => {
    setup({ out: { includeAudio: true, format: "mov", keyColor: "black" } });
    fireEvent.click(tab("내보내기"));
    expect(screen.getByText(/배경이 투명한 영상 파일 한 개로 저장/)).toBeTruthy();
    expect(screen.getByText(/예상 용량은 약/)).toBeTruthy();
    expect(screen.getByText("영상에 음원이 함께 들어갑니다.")).toBeTruthy();
  });

  it("합성용 출력일 때 화면 탭에 배경이 적용되지 않는다는 안내가 나온다", () => {
    setup({ out: { includeAudio: true, format: "png", keyColor: "black" } });
    fireEvent.click(tab("화면"));
    expect(screen.getByText(/배경 설정이 결과물에 적용되지 않습니다/)).toBeTruthy();
  });

  it("음원이 없으면 오디오 탭에 안내가 나온다", () => {
    setup({ audioDuration: null, outDuration: 0 });
    fireEvent.click(tab("오디오"));
    expect(screen.getByText(/음원을 올리면 구간 자르기/)).toBeTruthy();
  });

  it("배경 종류에 따라 파일 선택 버튼이 바뀐다", () => {
    setup({ s: { ...DEFAULT_SETTINGS, bgKind: "video" } });
    fireEvent.click(tab("화면"));
    expect(screen.getByText("영상 선택")).toBeTruthy();
    expect(screen.queryByText("이미지 선택")).toBeNull();
  });
});
