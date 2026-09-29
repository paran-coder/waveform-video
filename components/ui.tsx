// 설정 패널에서 쓰는 공용 입력 컴포넌트 모음
import type { ReactNode } from "react";

export function Section({ title, children, open }: { title: string; children: ReactNode; open?: boolean }) {
  return (
    <details open={open} className="group rounded-xl border border-white/10 bg-white/[0.04]">
      <summary className="flex cursor-pointer select-none list-none items-center justify-between px-4 py-3 text-sm font-semibold">
        {title}
        <span className="text-neutral-500 transition group-open:rotate-90">›</span>
      </summary>
      <div className="space-y-3 px-4 pb-4">{children}</div>
    </details>
  );
}

export function Slider(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  const { label, value, min, max, step, onChange, format } = props;
  return (
    <label className="block">
      <div className="mb-1 flex justify-between text-xs text-neutral-300">
        <span>{label}</span>
        <span className="tabular-nums text-neutral-400">{format ? format(value) : value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-6 w-full accent-cyan-400"
      />
    </label>
  );
}

export function Select<T extends string | number>(props: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  const { label, value, options, onChange } = props;
  return (
    <label className="flex items-center justify-between gap-3 text-xs text-neutral-300">
      <span>{label}</span>
      <select
        value={String(value)}
        onChange={(e) => {
          const o = options.find((x) => String(x.value) === e.target.value);
          if (o) onChange(o.value);
        }}
        className="rounded-lg border border-white/10 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100"
      >
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 text-xs text-neutral-300">
      <span>{label}</span>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-14 cursor-pointer rounded border border-white/10 bg-transparent"
      />
    </label>
  );
}

export function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 text-xs text-neutral-300">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-5 w-5 accent-cyan-400"
      />
    </label>
  );
}

export function TextField(props: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="block text-xs text-neutral-300">
      <span className="mb-1 block">{props.label}</span>
      <input
        type="text"
        value={props.value}
        placeholder={props.placeholder}
        onChange={(e) => props.onChange(e.target.value)}
        className="w-full rounded-lg border border-white/10 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600"
      />
    </label>
  );
}

export function FileButton(props: { label: string; accept: string; onFile: (f: File) => void }) {
  return (
    <label className="inline-flex cursor-pointer items-center rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-medium text-neutral-100 active:bg-white/10">
      <input
        type="file"
        accept={props.accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) props.onFile(f);
          e.target.value = "";
        }}
      />
      {props.label}
    </label>
  );
}

export function Button(props: { children: ReactNode; onClick: () => void; kind?: "primary" | "ghost" | "danger"; disabled?: boolean }) {
  const tone =
    props.kind === "primary"
      ? "bg-cyan-400 text-neutral-950 font-semibold"
      : props.kind === "danger"
        ? "border border-red-400/40 text-red-300"
        : "border border-white/15 bg-white/5 text-neutral-100";
  return (
    <button
      type="button"
      disabled={props.disabled}
      onClick={props.onClick}
      className={`rounded-lg px-3 py-2 text-xs disabled:opacity-40 ${tone}`}
    >
      {props.children}
    </button>
  );
}
