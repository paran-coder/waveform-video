// 구간과 페이드가 적용된 음원을 16비트 WAV 파일로 만드는 모듈 (PNG 시퀀스와 함께 넣는 용도)
import { clamp, fadeGain } from "./settings";

export function encodeWav(buffer: AudioBuffer, startSec: number, durSec: number, fadeIn: number, fadeOut: number): Uint8Array {
  const sr = buffer.sampleRate;
  const ch = Math.min(2, buffer.numberOfChannels);
  const start = Math.round(startSec * sr);
  const n = Math.max(0, Math.min(Math.round(durSec * sr), buffer.length - start));
  const bytes = n * ch * 2;
  const out = new DataView(new ArrayBuffer(44 + bytes));
  const str = (o: number, t: string) => [...t].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  out.setUint32(4, 36 + bytes, true);
  str(8, "WAVE");
  str(12, "fmt ");
  out.setUint32(16, 16, true);
  out.setUint16(20, 1, true);
  out.setUint16(22, ch, true);
  out.setUint32(24, sr, true);
  out.setUint32(28, sr * ch * 2, true);
  out.setUint16(32, ch * 2, true);
  out.setUint16(34, 16, true);
  str(36, "data");
  out.setUint32(40, bytes, true);
  const data = Array.from({ length: ch }, (_, c) => buffer.getChannelData(c));
  for (let i = 0; i < n; i++) {
    const g = fadeGain(i / sr, durSec, fadeIn, fadeOut);
    for (let c = 0; c < ch; c++) {
      const v = clamp(data[c][start + i] * g, -1, 1);
      out.setInt16(44 + (i * ch + c) * 2, Math.round(v < 0 ? v * 0x8000 : v * 0x7fff), true);
    }
  }
  return new Uint8Array(out.buffer);
}
