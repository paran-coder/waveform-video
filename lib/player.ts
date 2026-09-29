// 미리보기용 오디오 재생기. 구간 자르기와 페이드를 반영해 재생 위치를 관리한다.
import { fadeGain, type Timeline } from "./settings";

export class Player {
  private ctx = new AudioContext();
  private gain = this.ctx.createGain();
  private source: AudioBufferSourceNode | null = null;
  private buffer: AudioBuffer | null = null;
  private tl: Timeline = { start: 0, end: 0, fadeIn: 0, fadeOut: 0 };
  private pos = 0;
  private startedAt = 0;
  playing = false;

  constructor() {
    this.gain.connect(this.ctx.destination);
  }

  get duration(): number {
    return Math.max(0, this.tl.end - this.tl.start);
  }

  configure(buffer: AudioBuffer, tl: Timeline): void {
    this.pause();
    this.buffer = buffer;
    this.tl = tl;
    this.pos = Math.min(this.pos, this.duration);
  }

  getTime(): number {
    if (!this.playing) return this.pos;
    return Math.min(this.duration, this.pos + (this.ctx.currentTime - this.startedAt));
  }

  async play(): Promise<void> {
    if (!this.buffer || this.playing) return;
    if (this.pos >= this.duration - 0.01) this.pos = 0;
    await this.ctx.resume();
    this.startSource();
  }

  pause(): void {
    if (!this.playing) return;
    this.pos = this.getTime();
    this.stopSource();
    this.playing = false;
  }

  // 재생 중에 이동해도 playing 상태가 끊기지 않도록 소스를 동기적으로 교체한다.
  seek(t: number): void {
    const next = Math.min(Math.max(0, t), this.duration);
    if (this.playing) {
      this.stopSource();
      this.pos = next;
      this.startSource();
    } else {
      this.pos = next;
    }
  }

  private startSource(): void {
    if (!this.buffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer;
    src.connect(this.gain);
    const now = this.ctx.currentTime;
    this.scheduleFades(now);
    src.onended = () => {
      if (this.source !== src) return;
      this.pos = this.duration;
      this.playing = false;
      this.source = null;
    };
    src.start(0, this.tl.start + this.pos, this.duration - this.pos);
    this.source = src;
    this.startedAt = now;
    this.playing = true;
  }

  dispose(): void {
    this.stopSource();
    void this.ctx.close();
  }

  private stopSource(): void {
    const s = this.source;
    this.source = null;
    if (s) {
      s.onended = null;
      try {
        s.stop();
      } catch {
        /* 이미 멈춘 경우 */
      }
    }
  }

  private scheduleFades(now: number): void {
    const { fadeIn, fadeOut } = this.tl;
    const dur = this.duration;
    const g = this.gain.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(fadeGain(this.pos, dur, fadeIn, fadeOut), now);
    if (fadeIn > 0 && this.pos < fadeIn) g.linearRampToValueAtTime(1, now + (fadeIn - this.pos));
    if (fadeOut > 0) {
      const a = Math.max(this.pos, dur - fadeOut);
      g.setValueAtTime(fadeGain(a, dur, fadeIn, fadeOut), now + (a - this.pos));
      g.linearRampToValueAtTime(0, now + (dur - this.pos));
    }
  }
}
