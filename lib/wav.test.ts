// WAV 헤더, 길이, 페이드가 올바른지 확인하는 테스트
import { describe, expect, it } from "vitest";
import { encodeWav } from "./wav";

function fake(sec: number, sr = 8000, ch = 2, level = 0.5): AudioBuffer {
  const data = Array.from({ length: ch }, () => new Float32Array(sec * sr).fill(level));
  return { sampleRate: sr, numberOfChannels: ch, length: data[0].length, getChannelData: (c: number) => data[c] } as unknown as AudioBuffer;
}

describe("encodeWav", () => {
  it("헤더와 데이터 길이가 구간과 일치한다", () => {
    const wav = encodeWav(fake(4), 1, 2, 0, 0);
    const v = new DataView(wav.buffer);
    const str = (o: number, n: number) => String.fromCharCode(...wav.slice(o, o + n));
    expect(str(0, 4)).toBe("RIFF");
    expect(str(8, 4)).toBe("WAVE");
    expect(str(36, 4)).toBe("data");
    expect(v.getUint16(22, true)).toBe(2);
    expect(v.getUint32(24, true)).toBe(8000);
    expect(v.getUint32(40, true)).toBe(2 * 8000 * 2 * 2);
    expect(wav.length).toBe(44 + 2 * 8000 * 2 * 2);
    expect(v.getInt16(44, true)).toBe(Math.round(0.5 * 0x7fff));
  });

  it("페이드 인은 첫 샘플을 0에서 시작하고 페이드 아웃은 끝을 0으로 만든다", () => {
    const wav = encodeWav(fake(4), 0, 4, 1, 1);
    const v = new DataView(wav.buffer);
    expect(v.getInt16(44, true)).toBe(0);
    const mid = 44 + 2 * 2 * 2 * 8000;
    expect(v.getInt16(mid, true)).toBe(Math.round(0.5 * 0x7fff));
    const last = wav.length - 4;
    expect(Math.abs(v.getInt16(last, true))).toBeLessThan(10);
  });

  it("모노 음원은 1채널로 만든다", () => {
    const wav = encodeWav(fake(1, 8000, 1), 0, 1, 0, 0);
    expect(new DataView(wav.buffer).getUint16(22, true)).toBe(1);
    expect(wav.length).toBe(44 + 8000 * 2);
  });
});
