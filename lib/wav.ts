// 구간과 페이드가 적용된 음원을 16비트 WAV 파일로 만드는 모듈 (PNG 시퀀스와 함께 넣는 용도)
import { clamp, fadeGain } from "./settings";

// 오디오 채널 수 (최대 2)
export function pcmChannels(buffer: AudioBuffer): number {
  return Math.min(2, buffer.numberOfChannels);
}

// 구간의 전체 프레임(샘플) 수
export function pcmFrames(buffer: AudioBuffer, startSec: number, durSec: number): number {
  const start = Math.round(startSec * buffer.sampleRate);
  return Math.max(0, Math.min(Math.round(durSec * buffer.sampleRate), buffer.length - start));
}

// 구간과 페이드를 적용한 16비트 리틀엔디언 인터리브 PCM 바이트. from과 count로 일부만 만들 수 있다.
export function pcm16(
  buffer: AudioBuffer,
  startSec: number,
  durSec: number,
  fadeIn: number,
  fadeOut: number,
  from = 0,
  count?: number,
): Uint8Array {
  const sr = buffer.sampleRate;
  const ch = pcmChannels(buffer);
  const start = Math.round(startSec * sr);
  const total = pcmFrames(buffer, startSec, durSec);
  const n = Math.max(0, Math.min(count ?? total - from, total - from));
  const out = new DataView(new ArrayBuffer(n * ch * 2));
  const data = Array.from({ length: ch }, (_, c) => buffer.getChannelData(c));
  for (let i = 0; i < n; i++) {
    const g = fadeGain((from + i) / sr, durSec, fadeIn, fadeOut);
    for (let c = 0; c < ch; c++) {
      const v = clamp(data[c][start + from + i] * g, -1, 1);
      out.setInt16((i * ch + c) * 2, Math.round(v < 0 ? v * 0x8000 : v * 0x7fff), true);
    }
  }
  return new Uint8Array(out.buffer);
}

export function encodeWav(buffer: AudioBuffer, startSec: number, durSec: number, fadeIn: number, fadeOut: number): Uint8Array {
  const sr = buffer.sampleRate;
  const ch = pcmChannels(buffer);
  const pcm = pcm16(buffer, startSec, durSec, fadeIn, fadeOut);
  const out = new Uint8Array(44 + pcm.length);
  const v = new DataView(out.buffer);
  const str = (o: number, t: string) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, 36 + pcm.length, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, ch, true);
  v.setUint32(24, sr, true);
  v.setUint32(28, sr * ch * 2, true);
  v.setUint16(32, ch * 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, pcm.length, true);
  out.set(pcm, 44);
  return out;
}
