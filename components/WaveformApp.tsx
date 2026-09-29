"use client";
// 파형 비디오 생성기의 메인 화면. 상태 관리, 미리보기 재생, 내보내기를 연결한다.
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Analyzer, decodeAudio, makeDemoFrame } from "@/lib/audio";
import { loadImage, loadVideo } from "@/lib/assets";
import { checkSupport, exportMp4 } from "@/lib/export";
import { exportMov } from "@/lib/exportMov";
import { exportPngSequence } from "@/lib/exportPng";
import { Player } from "@/lib/player";
import { renderFrame, type Assets, type RenderOpts } from "@/lib/render";
import {
  DEFAULT_SETTINGS,
  KEY_COLORS,
  fadeGain,
  getSize,
  mergeSettings,
  type ImageLayer,
  type LogoLayer,
  type OutputOptions,
  type Settings,
  type Timeline,
} from "@/lib/settings";
import SettingsPanel, { type AssetKind } from "./SettingsPanel";
import { Button, FileRow, Notice } from "./ui";

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
  const [assetNames, setAssetNames] = useState<Partial<Record<AssetKind, string>>>({});
  const [out, setOutState] = useState<OutputOptions>({ includeAudio: true, format: "mp4", keyColor: "black" });
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

  // 출력 형식에 따라 배경을 투명 또는 단색으로 그린다. 미리보기도 같은 모습으로 보여 준다.
  const renderOpts = useMemo<RenderOpts>(
    () => (out.format === "png" || out.format === "mov" ? { transparent: true } : out.format === "key" ? { solidBg: KEY_COLORS[out.keyColor] } : {}),
    [out.format, out.keyColor],
  );

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
        renderFrame(ctx, w, h, settings, assetsRef.current, frame, t, dur, fadeGain(t, dur, tl.fadeIn, tl.fadeOut), renderOpts);
      } else {
        const frame = makeDemoFrame(DEMO_TIME, settings.barCount);
        renderFrame(ctx, w, h, settings, assetsRef.current, frame, DEMO_TIME, 10, 1, renderOpts);
      }
    },
    // assetVer는 이미지나 영상이 바뀌었을 때 다시 그리기 위한 신호
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [settings, audio, tl, assetVer, renderOpts],
  );

  // 웹폰트가 늦게 도착해도 캔버스 글자가 바뀌도록 폰트 로딩이 끝나면 다시 그린다.
  const drawRef = useRef(draw);
  useEffect(() => {
    drawRef.current = draw;
  });
  useEffect(() => {
    const fonts = document.fonts;
    if (!fonts) return;
    const on = () => drawRef.current(playerRef.current?.getTime() ?? 0);
    fonts.addEventListener("loadingdone", on);
    return () => fonts.removeEventListener("loadingdone", on);
  }, []);
  useEffect(() => {
    void document.fonts?.load("700 32px 'Pretendard Variable'", settings.title + settings.artist).catch(() => {});
  }, [settings.title, settings.artist]);

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
  const setArt = (patch: Partial<ImageLayer>) => setSettings((s) => ({ ...s, art: { ...s.art, ...patch } }));
  const setLogo = (patch: Partial<LogoLayer>) => setSettings((s) => ({ ...s, logo: { ...s.logo, ...patch } }));
  const setOut = (patch: Partial<OutputOptions>) => setOutState((o) => ({ ...o, ...patch }));

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
        const img = await loadImage(file, kind === "bgImage" ? 1920 : 1024);
        if (kind === "bgImage") {
          assetsRef.current.bgImage = img;
          set({ bgKind: "image" });
        } else {
          assetsRef.current[kind] = img;
          if (kind === "art") setArt({ enabled: true });
          else setLogo({ enabled: true });
        }
      }
      setAssetNames((n) => ({ ...n, [kind]: file.name }));
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
    if (out.format === "mp4" || out.format === "key") {
      const msg = checkSupport();
      if (msg) {
        setError(msg);
        return;
      }
    }
    setError(null);
    playerRef.current?.pause();
    assetsRef.current.bgVideo?.pause();
    setPlaying(false);
    const ac = new AbortController();
    abortRef.current = ac;
    setExp({ p: 0, label: "준비하는 중" });
    try {
      await document.fonts?.load("700 32px 'Pretendard Variable'", settings.title + settings.artist).catch(() => {});
      const common = {
        buffer: audio.buffer,
        analyzer: audio.analyzer,
        settings,
        timeline: tl,
        assets: assetsRef.current,
        includeAudio: out.includeAudio,
        signal: ac.signal,
        onProgress: (p: number, label: string) => setExp({ p, label }),
      };
      const base = (settings.title || audio.name || "waveform").replace(/[\\/:*?"<>|]/g, "_");
      if (out.format === "png") {
        download(await exportPngSequence(common), `${base}_png.zip`);
      } else if (out.format === "mov") {
        download(await exportMov(common), `${base}_transparent.mov`);
      } else {
        const blob = await exportMp4({ ...common, render: renderOpts });
        download(blob, out.format === "key" ? `${base}_${out.keyColor === "green" ? "green" : "black"}.mp4` : `${base}.mp4`);
      }
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

  // 프리셋은 파형의 스타일만 바꾼다. 내용에 해당하는 제목, 아티스트, 그 표시 여부, 로고는 유지한다.
  const loadPreset = (p: Partial<Settings>) =>
    setSettings((cur) => ({ ...mergeSettings(p), title: cur.title, artist: cur.artist, textOn: cur.textOn, logo: cur.logo }));

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
  const transparentOut = out.format === "png" || out.format === "mov";
  const exportLabel =
    (out.format === "png"
      ? "투명 PNG 시퀀스로 내보내기"
      : out.format === "mov"
        ? "투명 MOV로 내보내기"
        : out.format === "key"
          ? "합성용 MP4로 내보내기"
          : "MP4로 내보내기") +
    (out.includeAudio ? "" : " (소리 없음)");

  return (
    <div className="mx-auto min-h-dvh max-w-[1400px] px-3 pb-16 lg:grid lg:grid-cols-[minmax(0,1fr)_520px] lg:items-start lg:gap-6 lg:px-6 lg:py-6">
      <div className="contents lg:sticky lg:top-6 lg:block lg:max-h-[calc(100dvh-3rem)] lg:self-start lg:overflow-y-auto lg:overscroll-contain">
        <div className="sticky top-0 z-20 -mx-3 bg-canvas/95 px-3 pb-2 pt-3 backdrop-blur lg:static lg:mx-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
          <canvas
            ref={canvasRef}
            width={pw}
            height={ph}
            aria-label="파형 미리보기"
            style={transparentOut ? { background: "conic-gradient(#3a4150 25%, #262c38 0 50%, #3a4150 0 75%, #262c38 0) 0 0 / 24px 24px" } : undefined}
            className={`mx-auto block h-auto max-h-[34vh] w-auto max-w-full rounded-xl ring-1 ring-line lg:max-h-[max(12rem,calc(100dvh-17rem))] ${transparentOut ? "" : "bg-black"}`}
          />
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={togglePlay}
              disabled={!audio}
              aria-label={playing ? "정지" : "재생"}
              className="flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center rounded-full bg-accent text-accent-ink transition-transform duration-200 hover:bg-[#8cf0fb] active:scale-95 disabled:cursor-not-allowed disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {playing ? (
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden>
                  <rect x="6" y="5" width="4" height="14" rx="1" />
                  <rect x="14" y="5" width="4" height="14" rx="1" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden>
                  <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" />
                </svg>
              )}
            </button>
            <input
              type="range"
              className="wf-range"
              aria-label="재생 위치"
              min={0}
              max={outDur || 1}
              step={0.01}
              value={Math.min(time, outDur || 1)}
              disabled={!audio}
              style={{ "--p": `${outDur ? (Math.min(time, outDur) / outDur) * 100 : 0}%` } as React.CSSProperties}
              onChange={(e) => onSeek(Number(e.target.value))}
            />
            <span className="w-28 shrink-0 text-right text-[15px] tabular-nums text-ink-2">
              {mmss(time)} / {mmss(outDur)}
            </span>
          </div>
          {!audio && <p className="mt-1 text-sm text-ink-2">음원을 올리면 실제 파형이 표시됩니다. 지금은 예시 화면이에요.</p>}
        </div>

        <div className="space-y-3 py-3 lg:pt-4">
          <FileRow label={audio ? "음원 바꾸기" : "음원 파일 선택"} accept="audio/*" fileName={audio?.name} onFile={onAudioFile} />
          {busy && <Notice tone="info">{busy}</Notice>}
          {error && <Notice tone="error">{error}</Notice>}
          <button
            type="button"
            onClick={onExport}
            disabled={!audio || !!exp}
            className="min-h-14 w-full cursor-pointer rounded-xl bg-white text-base font-bold text-slate-950 transition-colors duration-200 hover:bg-slate-200 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {exportLabel}
          </button>
        </div>
      </div>

      <SettingsPanel
        s={settings}
        set={set}
        setArt={setArt}
        setLogo={setLogo}
        onAsset={onAsset}
        assetNames={assetNames}
        audioDuration={audio ? audio.buffer.duration : null}
        outDuration={outDur}
        tl={tl}
        setTl={updateTl}
        out={out}
        setOut={setOut}
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
        supportMsg={out.format === "mp4" || out.format === "key" ? supportMsg : null}
      />

      {exp && (
        <div role="dialog" aria-modal="true" aria-label="내보내기 진행 상황" className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6">
          <div className="w-full max-w-sm space-y-4 rounded-2xl bg-surface p-6 ring-1 ring-line">
            <p className="text-lg font-semibold">{out.format === "png" ? "PNG 시퀀스를 만들고 있습니다." : out.format === "mov" ? "투명 MOV를 만들고 있습니다." : "MP4를 만들고 있습니다."}</p>
            <div className="h-2.5 overflow-hidden rounded-full bg-[#414a5c]">
              <div className="h-full bg-accent transition-[width] duration-200" style={{ width: `${Math.round(exp.p * 100)}%` }} />
            </div>
            <p className="text-[15px] tabular-nums text-ink-2">
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
