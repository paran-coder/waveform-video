"use client";
// 설정 패널에서 쓰는 공용 입력 컴포넌트. 터치 영역 44px 이상, 글자 14px 이상, 대비 4.5:1 이상을 지킨다.
import { useId, type CSSProperties, type ReactNode } from "react";

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export function Group({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="border-b border-line pb-2">
        <h3 className="text-base font-semibold text-ink">{title}</h3>
        {hint && <p className="mt-0.5 text-sm text-ink-2">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

// 슬라이더를 넓은 화면에서는 두 줄로 나란히 놓는다.
export function TwoCol({ children }: { children: ReactNode }) {
  return <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">{children}</div>;
}

export function Slider(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  disabled?: boolean;
}) {
  const { label, value, min, max, step, onChange, format, disabled } = props;
  const id = useId();
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-[15px] font-medium text-ink">
          {label}
        </label>
        <span className="text-[15px] tabular-nums text-ink-2">{format ? format(value) : value}</span>
      </div>
      <input
        id={id}
        type="range"
        className="wf-range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        style={{ "--p": `${pct}%` } as CSSProperties}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

export function Switch(props: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const { label, hint, checked, onChange, disabled } = props;
  const hintId = useId();
  return (
    <button
      type="button"
      role="switch"
      aria-label={label}
      aria-describedby={hint ? hintId : undefined}
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`flex min-h-11 w-full cursor-pointer items-center justify-between gap-4 rounded-lg py-1 text-left disabled:cursor-not-allowed disabled:opacity-40 ${focusRing}`}
    >
      <span className="min-w-0">
        <span className="block text-[15px] font-medium text-ink">{label}</span>
        {hint && (
          <span id={hintId} className="block text-sm text-ink-2">
            {hint}
          </span>
        )}
      </span>
      <span
        aria-hidden
        className={`relative h-8 w-14 shrink-0 rounded-full transition-colors duration-200 ${checked ? "bg-accent" : "bg-[#414a5c]"}`}
      >
        <span
          className={`absolute left-1 top-1 h-6 w-6 rounded-full bg-white shadow transition-transform duration-200 ${checked ? "translate-x-6" : ""}`}
        />
      </span>
    </button>
  );
}

export function Segmented<T extends string | number>(props: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  cols?: number;
}) {
  const { label, value, options, onChange, cols } = props;
  return (
    <div role="radiogroup" aria-label={label}>
      <div className="mb-1.5 text-[15px] font-medium text-ink">{label}</div>
      <div
        className="grid gap-1 rounded-xl bg-canvas p-1 ring-1 ring-line"
        style={{ gridTemplateColumns: `repeat(${cols ?? options.length}, minmax(0, 1fr))` }}
      >
        {options.map((o) => {
          const on = o.value === value;
          return (
            <button
              key={String(o.value)}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(o.value)}
              className={`min-h-11 cursor-pointer rounded-lg px-2 text-[15px] font-medium transition-colors duration-200 ${focusRing} ${
                on ? "bg-accent text-accent-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink"
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3">
      <span className="text-[15px] font-medium text-ink">{label}</span>
      <span className="flex items-center gap-2">
        <span className="text-sm uppercase tabular-nums text-ink-2">{value}</span>
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`h-11 w-11 cursor-pointer rounded-lg border border-line bg-transparent p-1 ${focusRing}`}
        />
      </span>
    </label>
  );
}

export function TextField(props: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; disabled?: boolean }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[15px] font-medium text-ink">
        {props.label}
      </label>
      <input
        id={id}
        type="text"
        value={props.value}
        placeholder={props.placeholder}
        disabled={props.disabled}
        onChange={(e) => props.onChange(e.target.value)}
        className={`h-11 w-full rounded-lg border border-line bg-canvas px-3 text-base text-ink placeholder:text-[#7d8597] disabled:opacity-40 ${focusRing}`}
      />
    </div>
  );
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 16V4m0 0-4 4m4-4 4 4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
    </svg>
  );
}

export function FileRow(props: { label: string; accept: string; fileName?: string | null; onFile: (f: File) => void }) {
  return (
    <div className="flex items-center gap-3">
      <label className="relative inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-2 rounded-lg bg-surface-2 px-4 text-[15px] font-medium text-ink ring-1 ring-line transition-colors duration-200 hover:bg-[#283040] focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent">
        <UploadIcon />
        {props.label}
        <input
          type="file"
          accept={props.accept}
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) props.onFile(f);
            e.target.value = "";
            e.target.blur(); // 선택 뒤 포커스가 남아 화면이 움직이지 않게 한다.
          }}
        />
      </label>
      <span className="min-w-0 flex-1 truncate text-sm text-ink-2">{props.fileName ?? "선택한 파일 없음"}</span>
    </div>
  );
}

export function Button(props: { children: ReactNode; onClick: () => void; kind?: "primary" | "secondary" | "danger"; disabled?: boolean }) {
  const tone =
    props.kind === "primary"
      ? "bg-accent text-accent-ink hover:bg-[#8cf0fb]"
      : props.kind === "danger"
        ? "text-danger ring-1 ring-[#7f3b3b] hover:bg-[#3a1f24]"
        : "bg-surface-2 text-ink ring-1 ring-line hover:bg-[#283040]";
  return (
    <button
      type="button"
      disabled={props.disabled}
      onClick={props.onClick}
      className={`min-h-11 cursor-pointer rounded-lg px-4 text-[15px] font-medium transition-colors duration-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 ${tone} ${focusRing}`}
    >
      {props.children}
    </button>
  );
}

export function Notice({ tone, children }: { tone: "info" | "error" | "warn"; children: ReactNode }) {
  const c =
    tone === "error"
      ? "border-[#7f3b3b] bg-[#2a1a1e] text-[#fecaca]"
      : tone === "warn"
        ? "border-[#7a5a1e] bg-[#2a2213] text-[#fde68a]"
        : "border-line bg-surface-2 text-ink-2";
  return (
    <p role={tone === "error" ? "alert" : undefined} className={`rounded-lg border px-4 py-3 text-[15px] leading-relaxed ${c}`}>
      {children}
    </p>
  );
}
