"use client";
// 파형 비디오 생성기의 메인 화면. 상태 관리, 미리보기 재생, 내보내기를 연결한다.
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Analyzer, decodeAudio, makeDemoFrame } from "@/lib/audio";
import { loadImage, loadVideo } from "@/lib/assets";
import { checkSupport, exportMp4 } from "@/lib/export";
import { Player } from "@/lib/player";
import { renderFrame, type Assets } from "@/lib/render";
import {
  DEFAULT_SETTINGS,
  fadeGain,
  getSize,
  mergeSettings,
  type ImageLayer,
  type Settings,
  type Timeline,
} from "@/lib/settings";
import SettingsPanel, { type AssetKind } from "./SettingsPanel";
import { Button, FileButton } from "./ui";

interface LoadedAudio {
  name: string;
  buffer: AudioBuffer;
  analyzer: Analyzer;
}

const PRESET_KEY = "waveform-presets-v1";

// localStorage의 프리셋을 React 상태처럼 구독한다. 서버 렌더링에서는 빈 값을 쓴다.
const presetListeners = new Set<() => void>();
function subscribePresets(cb: () => void) {
  presetListeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    presetListeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}
function readPresetsRaw(): string {
  try {
    return localStorage.getItem(PRESET_KEY) ?? "";
  } catch {
    return "";
  }
}
const readServerRaw = () => "";
const noopSubscribe = () => () => {};
const getSupportMsg = () => checkSupport();
const getServerSupportMsg = () => null;
const DEMO_TIME = 1.3;

function previewSize(s: Settings): [number, number] {
  const [w, h] = getSize(s.aspect, s.resolution);
  const k = 540 / Math.min(w, h);
  return [Math.round((w * k) / 2) * 2, Math.round((h * k) / 2) * 2];
}

function mmss(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export default function WaveformApp() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [audio, setAudio] = useState<LoadedAudio | null>(null);
  const [tl, setTl] = useState<Timeline>({ start: 0, end: 0, fadeIn: 0, fadeOut: 0 });
  const [assetVer, setAssetVer] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [exp, setExp] = useState<{ p: number; label: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const supportMsg = useSyncExternalStore(noopSubscribe, getSupportMsg, getServerSupportMsg);
  const presetsRaw = useSyncExternalStore(subscribePresets, readPresetsRaw, readServerRaw);
  const presets = useMemo<Record<string, Settings>>(() => {
    try {
      return presetsRaw ? JSON.parse(presetsRaw) : {};
    } catch {
      return {};
    }
  }, [presetsRaw]);

  const assetsRef = useRef<Assets>({});
  const playerRef = useRef<Player | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => playerRef.current?.dispose(), []);

  const outDur = audio ? Math.max(0, tl.end - tl.start) : 0;

  const draw = useCallback(
    (t: number) => {
      const c = canvasRef.current;
      if (!c) return;
      const [w, h] = previewSize(settings);
      if (c.width !== w || c.height !== h) {
        c.width = w;
        c.height = h;
      }
      const ctx = c.getContext("2d");
      if (!ctx) return;
      if (audio) {
        const dur = tl.end - tl.start;
        const frame = audio.analyzer.getFrame(tl.start + t, { bands: settings.barCount, smoothing: settings.smoothing });
        renderFrame(ctx, w, h, settings, assetsRef.current, frame, t, dur, fadeGain(t, dur, tl.fadeIn, tl.fadeOut));
      } else {
        const frame = makeDemoFrame(DEMO_TIME, settings.barCount);
        renderFrame(ctx, w, h, settings, assetsRef.current, frame, DEMO_TIME, 10, 1);
      }
    },
    // assetVer는 이미지나 영상이 바뀌었을 때 다시 그리기 위한 신호
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [settings, audio, tl, assetVer],
  );

  // 정지 상태에서는 값이 바뀔 때만, 재생 중에는 매 프레임 그린다.
  useEffect(() => {
    if (!playing) {
      draw(playerRef.current?.getTime() ?? 0);
      return;
    }
    let raf = 0;
    let lastUi = 0;
    const loop = (ts: number) => {
      const p = playerRef.current;
      if (!p) return;
      const t = p.getTime();
      draw(t);
      if (ts - lastUi > 100) {
        setTime(t);
        lastUi = ts;
      }
      if (!p.playing) {
        assetsRef.current.bgVideo?.pause();
        setTime(p.getTime());
        setPlaying(false);
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, draw]);

  const set = (patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch }));
  const setLayer = (k: "art" | "logo", patch: Partial<ImageLayer>) =>
    setSettings((s) => ({ ...s, [k]: { ...s[k], ...patch } }));

  const applyTimeline = (buffer: AudioBuffer, next: Timeline) => {
    setTl(next);
    if (!playerRef.current) playerRef.current = new Player();
    playerRef.current.configure(buffer, next);
    assetsRef.current.bgVideo?.pause();
    setPlaying(false);
    setTime(playerRef.current.getTime());
  };

  const updateTl = (patch: Partial<Timeline>) => {
    if (audio) applyTimeline(audio.buffer, { ...tl, ...patch });
  };

  async function onAudioFile(file: File) {
    setError(null);
    setBusy("음원을 분석하는 중입니다.");
    try {
      const buffer = await decodeAudio(file);
      await new Promise((r) => setTimeout(r, 30));
      const analyzer = Analyzer.fromBuffer(buffer);
      const name = file.name.replace(/\.[^.]+$/, "");
      setAudio({ name, buffer, analyzer });
      applyTimeline(buffer, { start: 0, end: buffer.duration, fadeIn: 0, fadeOut: 0 });
      setSettings((s) => (s.title ? s : { ...s, title: name }));
    } catch {
      setError("음원을 읽을 수 없습니다. mp3, wav, m4a, ogg 파일인지 확인해 주세요.");
    } finally {
      setBusy(null);
    }
  }

  async function onAsset(kind: AssetKind, file: File) {
    setError(null);
    try {
      if (kind === "bgVideo") {
        assetsRef.current.bgVideo = await loadVideo(file);
        set({ bgKind: "video" });
      } else {
        const img = await loadImage(file);
        if (kind === "bgImage") {
          assetsRef.current.bgImage = img;
          set({ bgKind: "image" });
        } else {
          assetsRef.current[kind] = img;
          setLayer(kind, { enabled: true });
        }
      }
      setAssetVer((v) => v + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "파일을 읽을 수 없습니다.");
    }
  }

  async function togglePlay() {
    const p = playerRef.current;
    if (!p || !audio) return;
    const v = assetsRef.current.bgVideo;
    if (playing) {
      p.pause();
      v?.pause();
      setPlaying(false);
      setTime(p.getTime());
      return;
    }
    await p.play();
    if (v) {
      v.currentTime = p.getTime() % (v.duration || 1);
      void v.play();
    }
    setPlaying(true);
  }

  function onSeek(t: number) {
    const p = playerRef.current;
    if (!p) return;
    p.seek(t);
    const v = assetsRef.current.bgVideo;
    if (v) v.currentTime = t % (v.duration || 1);
    setTime(t);
    if (!p.playing) draw(t);
  }

  async function onExport() {
    if (!audio) return;
    const msg = checkSupport();
    if (msg) {
      setError(msg);
      return;
    }
    setError(null);
    playerRef.current?.pause();
    assetsRef.current.bgVideo?.pause();
    setPlaying(false);
    const ac = new AbortController();
    abortRef.current = ac;
    setExp({ p: 0, label: "준비하는 중" });
    try {
      const blob = await exportMp4({
        buffer: audio.buffer,
        analyzer: audio.analyzer,
        settings,
        timeline: tl,
        assets: assetsRef.current,
        signal: ac.signal,
        onProgress: (p, label) => setExp({ p, label }),
      });
      const base = (settings.title || audio.name || "waveform").replace(/[\\/:*?"<>|]/g, "_");
      download(blob, `${base}.mp4`);
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) {
        setError(e instanceof Error ? e.message : "내보내기에 실패했습니다.");
      }
    } finally {
      setExp(null);
      abortRef.current = null;
      draw(playerRef.current?.getTime() ?? 0);
    }
  }

  const savePresets = (next: Record<string, Settings>) => {
    try {
      localStorage.setItem(PRESET_KEY, JSON.stringify(next));
      presetListeners.forEach((f) => f());
    } catch {
      setError("프리셋을 저장할 수 없습니다. 브라우저 저장 공간을 확인해 주세요.");
    }
  };

  const loadPreset = (p: Partial<Settings>) =>
    setSettings((cur) => ({ ...mergeSettings(p), title: cur.title, artist: cur.artist }));

  async function importJson(file: File) {
    try {
      const parsed = JSON.parse(await file.text());
      if (typeof parsed !== "object" || parsed === null) throw new Error();
      loadPreset(parsed);
    } catch {
      setError("설정 파일을 읽을 수 없습니다.");
    }
  }

  const [pw, ph] = previewSize(settings);

  return (
    <div className="mx-auto max-w-6xl px-3 pb-16 lg:grid lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-6 lg:px-4">
      <div className="contents lg:sticky lg:top-4 lg:block lg:self-start">
        <div className="sticky top-0 z-20 -mx-3 bg-neutral-950/95 px-3 pb-2 pt-3 backdrop-blur lg:static lg:mx-0 lg:px-0">
          <h1 className="mb-2 text-base font-bold lg:text-xl">파형 영상 만들기</h1>
          <canvas
            ref={canvasRef}
            width={pw}
            height={ph}
            className="mx-auto block h-auto max-h-[36vh] w-auto max-w-full rounded-lg bg-black lg:max-h-[68vh]"
          />
          <div className="mt-2 flex items-center gap-3">
            <button
              type="button"
              onClick={togglePlay}
              disabled={!audio}
              className="h-10 w-16 rounded-lg bg-cyan-400 text-sm font-semibold text-neutral-950 disabled:opacity-30"
            >
              {playing ? "정지" : "재생"}
            </button>
            <input
              type="range"
              min={0}
              max={outDur || 1}
              step={0.01}
              value={Math.min(time, outDur || 1)}
              disabled={!audio}
              onChange={(e) => onSeek(Number(e.target.value))}
              className="h-6 flex-1 accent-cyan-400 disabled:opacity-30"
            />
            <span className="w-24 text-right text-xs tabular-nums text-neutral-400">
              {mmss(time)} / {mmss(outDur)}
            </span>
          </div>
          {!audio && <p className="mt-1 text-xs text-neutral-500">음원을 올리면 실제 파형이 표시됩니다. 지금은 예시 화면입니다.</p>}
        </div>

        <div className="space-y-3 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <FileButton label={audio ? "음원 바꾸기" : "음원 파일 선택"} accept="audio/*" onFile={onAudioFile} />
            {audio && <span className="min-w-0 flex-1 truncate text-xs text-neutral-400">{audio.name}</span>}
          </div>
          {busy && <p className="text-xs text-cyan-300">{busy}</p>}
          {error && <p className="rounded-lg border border-red-400/30 bg-red-400/10 p-3 text-xs text-red-200">{error}</p>}
          {supportMsg && <p className="rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-xs text-amber-200">{supportMsg}</p>}
          <button
            type="button"
            onClick={onExport}
            disabled={!audio || !!exp}
            className="h-12 w-full rounded-xl bg-white text-sm font-bold text-neutral-950 disabled:opacity-30"
          >
            MP4로 내보내기
          </button>
          <p className="text-[11px] leading-relaxed text-neutral-500">
            내보내는 동안 이 탭을 켜 둬 주세요. 백그라운드로 보내면 느려질 수 있습니다. 파일은 서버로 전송되지 않고 이 기기에서만 처리됩니다.
          </p>
        </div>
      </div>

      <SettingsPanel
        s={settings}
        set={set}
        setLayer={setLayer}
        onAsset={onAsset}
        audioDuration={audio ? audio.buffer.duration : null}
        tl={tl}
        setTl={updateTl}
        presets={presets}
        onSavePreset={(name) => savePresets({ ...presets, [name]: settings })}
        onLoadPreset={loadPreset}
        onDeletePreset={(name) => {
          const next = { ...presets };
          delete next[name];
          savePresets(next);
        }}
        onExportJson={() => download(new Blob([JSON.stringify(settings, null, 2)], { type: "application/json" }), "waveform-settings.json")}
        onImportJson={importJson}
      />

      {exp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6">
          <div className="w-full max-w-sm space-y-4 rounded-2xl border border-white/10 bg-neutral-900 p-5">
            <p className="text-sm font-semibold">MP4를 만들고 있습니다.</p>
            <div className="h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full bg-cyan-400 transition-[width]" style={{ width: `${Math.round(exp.p * 100)}%` }} />
            </div>
            <p className="text-xs text-neutral-400">
              {exp.label} · {Math.round(exp.p * 100)}%
            </p>
            <Button kind="danger" onClick={() => abortRef.current?.abort()}>
              취소
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
