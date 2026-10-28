import Link from "next/link";
import type { ReactNode } from "react";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-gray-600">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

const TONES: Record<string, string> = {
  green: "bg-green-100 text-green-800 ring-green-200",
  red: "bg-red-100 text-red-800 ring-red-200",
  amber: "bg-amber-100 text-amber-800 ring-amber-200",
  blue: "bg-blue-100 text-blue-800 ring-blue-200",
  gray: "bg-gray-100 text-gray-700 ring-gray-200",
  purple: "bg-purple-100 text-purple-800 ring-purple-200",
};

const STATUS_TONE: Record<string, keyof typeof TONES> = {
  APPROVED: "green", ACTIVE: "green", PASSED: "green", CLOSED: "green", RELEASED: "green", VALID: "green", SUCCEEDED: "green", EXTRACTED: "green", OK: "green",
  DRAFT: "amber", PENDING: "amber", OPEN: "amber", IN_PROGRESS: "blue", INVESTIGATING: "blue", CAPA_IN_PROGRESS: "blue", PENDING_VERIFICATION: "purple",
  QUEUED: "gray", RUNNING: "blue", PROCESSING: "blue", UPLOADED: "gray", IN_PRODUCTION: "blue", SHIPPED: "gray", ARCHIVED: "gray", RETIRED: "gray", NO_EXPIRY: "gray", QUARANTINE: "amber", CONSUMED: "gray",
  REJECTED: "red", FAILED: "red", EXPIRED: "red", SUSPENDED: "red", ON_HOLD: "red", CRITICAL: "red", HIGH: "red", EXPIRING: "amber", MEDIUM: "amber", LOW: "gray", HOLD: "red", REWORK: "amber", DESTROY: "red", RELEASE: "green",
};

export function Badge({ children, tone, status }: { children: ReactNode; tone?: keyof typeof TONES; status?: string }) {
  const t = tone ?? (status ? STATUS_TONE[status] ?? "gray" : "gray");
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TONES[t]}`}>{children}</span>;
}

export function Card({ title, children, actions, className = "" }: { title?: string; children: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="text-sm font-semibold text-gray-800">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, hint, tone = "gray", href }: { label: string; value: ReactNode; hint?: string; tone?: "gray" | "red" | "green" | "amber"; href?: string }) {
  const color = { gray: "text-gray-900", red: "text-red-700", green: "text-green-700", amber: "text-amber-700" }[tone];
  const body = (
    <div className="card h-full">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${color}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-gray-500">{hint}</div>}
    </div>
  );
  return href ? <Link href={href} className="block hover:opacity-90">{body}</Link> : body;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-md border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">{children}</div>;
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-gray-500">{hint}</span>}
    </label>
  );
}

export function Flash({ error, ok }: { error?: string | null; ok?: string | null }) {
  if (!error && !ok) return null;
  return (
    <div role={error ? "alert" : "status"} className={`mb-4 rounded-md border px-3 py-2 text-sm ${error ? "border-red-200 bg-red-50 text-red-800" : "border-green-200 bg-green-50 text-green-800"}`}>
      {error ?? ok}
    </div>
  );
}

export function Table({ head, children, empty }: { head: ReactNode[]; children: ReactNode; empty?: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="table">
        <thead><tr>{head.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
      {empty}
    </div>
  );
}

/** Minimal accessible SVG bar chart (no client JS). */
export function BarChart({ data, label }: { data: Array<{ label: string; value: number }>; label: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const w = 28, gap = 8, h = 120;
  return (
    <svg role="img" aria-label={label} viewBox={`0 0 ${data.length * (w + gap)} ${h + 30}`} className="h-44 w-full">
      {data.map((d, i) => {
        const bh = Math.round((d.value / max) * h);
        return (
          <g key={d.label} transform={`translate(${i * (w + gap)},0)`}>
            <title>{`${d.label}: ${d.value}`}</title>
            <rect x={0} y={h - bh} width={w} height={bh} rx={3} className="fill-brand-500" />
            {d.value > 0 && <text x={w / 2} y={h - bh - 4} textAnchor="middle" className="fill-gray-700 text-[10px]">{d.value}</text>}
            <text x={w / 2} y={h + 14} textAnchor="middle" className="fill-gray-500 text-[9px]">{d.label.slice(8)}</text>
          </g>
        );
      })}
    </svg>
  );
}
