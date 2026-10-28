import Link from "next/link";
import {
  ArrowRight, Boxes, ClipboardCheck, Factory, FileChartColumn, FileText, History, KeyRound, LayoutDashboard, Lock, PlugZap,
  Route, ShieldCheck, Sparkles, Thermometer, TriangleAlert, Truck, Users, Wrench, type LucideIcon,
} from "lucide-react";
import type { TFn } from "@/i18n";
import { Logo, SiteFooter, SiteHeader, container } from "./marketing";

// Demo readings for the CCP chart: core temperature per batch (°C). Mirrors the seeded 72.8 °C deviation.
const READINGS = [78.4, 79.1, 77.6, 80.2, 78.9, 79.5, 77.9, 78.6, 79.8, 78.1, 72.8, 79.0, 78.7, 79.3];
const LIMIT = 75;
const CERTS = ["Halal BPJPH", "BPOM", "SPP-IRT", "SPPT-SNI", "ISO 22000", "FSSC 22000", "COA", "NIB"];

const eyebrow = "font-mono text-xs font-medium uppercase tracking-[0.14em] text-brand-700";
const h2 = "mt-3 text-3xl font-bold tracking-[-0.025em] text-ink sm:text-4xl";

export function Landing({ t, lang }: { t: TFn; lang: "id" | "en" }) {
  const num = (n: number) => new Intl.NumberFormat(lang === "id" ? "id-ID" : "en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n);
  return (
    <div lang={lang} className="min-h-screen bg-[#fbfcfb] text-ink">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-white focus:px-3 focus:py-2">{t("landing.skip")}</a>
      <SiteHeader t={t} lang={lang} path="/" />
      <main id="main">
        <Hero t={t} />
        <CertStrip t={t} />
        <How t={t} />
        <CcpChart t={t} num={num} />
        <DashboardShowcase t={t} num={num} />
        <Features t={t} />
        <AiByok t={t} />
        <Closing t={t} />
      </main>
      <SiteFooter t={t} lang={lang} path="/" />
    </div>
  );
}

function Hero({ t }: { t: TFn }) {
  return (
    <section className="overflow-hidden">
      <div className={`${container} grid gap-12 pb-16 pt-12 sm:pt-16 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-10 lg:pb-24 lg:pt-20`}>
        <div>
          <p className={eyebrow}>{t("landing.eyebrow")}</p>
          <h1 className="mt-4 text-[2.4rem] font-extrabold leading-[1.05] tracking-[-0.035em] text-ink sm:text-5xl lg:text-[3.5rem]">{t("landing.title")}</h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-gray-600">{t("landing.lead")}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/register" className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600">
              {t("landing.register")}<ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
            <Link href="/login" className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-5 py-3 text-sm font-semibold text-gray-800 hover:bg-gray-50">{t("landing.login")}</Link>
          </div>
          <p className="mt-6 flex items-start gap-2 text-sm text-gray-500"><Lock aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />{t("landing.heroNote")}</p>
        </div>
        <Specimen t={t} />
      </div>
    </section>
  );
}

/** Signature: one sentence of a real SOP becoming a CCP draft that waits for QA. Decorative; the copy beside it says the same thing. */
function Specimen({ t }: { t: TFn }) {
  const fields: Array<[string, string]> = [
    [t("landing.specHazardLabel"), t("landing.specHazard")],
    [t("landing.specLimitLabel"), t("landing.specLimit")],
    [t("landing.specMonitorLabel"), t("landing.specMonitor")],
    [t("landing.specActionLabel"), t("landing.specAction")],
  ];
  return (
    <div className="relative isolate mx-auto w-full max-w-lg lg:max-w-none">
      <div aria-hidden="true" className="absolute -inset-x-4 -inset-y-6 -z-10 rounded-[2rem] bg-mist sm:-inset-x-10 sm:-inset-y-8" />
      <figure className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6 lg:mr-14">
        <figcaption className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-gray-500">
          <FileText aria-hidden="true" className="h-3.5 w-3.5" />{t("landing.specFrom")}
        </figcaption>
        <p className="mt-1 font-mono text-xs text-gray-700">{t("landing.specDoc")}</p>
        <div className="mt-4 space-y-2 border-t border-dashed border-gray-200 pt-4 text-[15px] leading-7 text-gray-600">
          <p>{t("landing.specLine1")} <span className="lp-mark font-medium text-ink">{t("landing.specHighlight")}</span> {t("landing.specLine2")}</p>
          <p className="text-gray-400">{t("landing.specLine3")}</p>
        </div>
      </figure>
      <div className="relative -mt-4 ml-6 rounded-xl border border-amber-300 bg-white p-5 shadow-[0_18px_40px_-18px_rgba(16,35,27,0.35)] sm:ml-16 sm:p-6 lg:-mt-6">
        <div className="lp-rise flex flex-wrap items-center justify-between gap-2" style={{ animationDelay: "1.2s" }}>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800 ring-1 ring-inset ring-amber-200"><Sparkles aria-hidden="true" className="h-3.5 w-3.5" />{t("landing.specDraft")}</span>
          <span className="font-mono text-sm font-semibold text-ink">{t("landing.specCcp")}</span>
        </div>
        <dl className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {fields.map(([k, v], i) => (
            <div key={k} className="lp-rise" style={{ animationDelay: `${1.35 + i * 0.12}s` }}>
              <dt className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{k}</dt>
              <dd className={`mt-0.5 text-sm ${i === 1 ? "font-mono font-semibold text-brand-700" : "text-gray-800"}`}>{v}</dd>
            </div>
          ))}
        </dl>
        <div className="lp-rise mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-4" style={{ animationDelay: "1.9s" }}>
          <span className="flex items-center gap-2 text-xs font-medium text-amber-800"><span className="h-2 w-2 rounded-full bg-amber-500" />{t("landing.specPending")}</span>
          <span aria-hidden="true" className="flex gap-2">
            <span className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700">{t("landing.specReject")}</span>
            <span className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white">{t("landing.specApprove")}</span>
          </span>
        </div>
      </div>
    </div>
  );
}

function CertStrip({ t }: { t: TFn }) {
  return (
    <section aria-label={t("landing.certsLabel")} className="border-y border-gray-200 bg-white">
      <div className={`${container} flex flex-col gap-3 py-5 sm:flex-row sm:items-center sm:gap-6`}>
        <p className="shrink-0 text-xs font-medium text-gray-500">{t("landing.certsLabel")}</p>
        <ul className="flex flex-wrap gap-x-5 gap-y-1.5 font-mono text-[13px] text-gray-700">
          {CERTS.map((c) => <li key={c}>{c}</li>)}
        </ul>
      </div>
    </section>
  );
}

function How({ t }: { t: TFn }) {
  const steps: Array<[LucideIcon, string, string]> = [
    [FileText, t("landing.steps.s1t"), t("landing.steps.s1d")],
    [Sparkles, t("landing.steps.s2t"), t("landing.steps.s2d")],
    [ShieldCheck, t("landing.steps.s3t"), t("landing.steps.s3d")],
    [ClipboardCheck, t("landing.steps.s4t"), t("landing.steps.s4d")],
    [Wrench, t("landing.steps.s5t"), t("landing.steps.s5d")],
  ];
  return (
    <section id="cara-kerja" className="scroll-mt-20 py-20 lg:py-28">
      <div className={container}>
        <p className={eyebrow}>{t("landing.howEyebrow")}</p>
        <h2 className={`${h2} max-w-2xl`}>{t("landing.howTitle")}</h2>
        {/* An ordered list: the order is the actual workflow. */}
        <ol className="mt-12 grid gap-8 md:grid-cols-5 md:gap-5">
          {steps.map(([Icon, title, desc], i) => (
            <li key={title} className="relative md:pt-10">
              {i < steps.length - 1 && <span aria-hidden="true" className="absolute left-12 right-0 top-[19px] hidden h-px bg-gray-200 md:block" />}
              <div className="flex items-center gap-3 md:absolute md:left-0 md:top-0">
                <span className={`grid h-10 w-10 place-items-center rounded-full border ${i === 1 ? "border-amber-300 bg-amber-50 text-amber-700" : "border-gray-200 bg-white text-brand-700"}`}><Icon aria-hidden="true" className="h-[18px] w-[18px]" /></span>
                <span className="font-mono text-xs text-gray-400 md:hidden">{i + 1}</span>
              </div>
              <h3 className="mt-3 text-base font-semibold text-ink md:mt-4"><span className="mr-1.5 hidden font-mono text-xs font-normal text-gray-400 md:inline">{i + 1}</span>{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-gray-600">{desc}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function CcpChart({ t, num }: { t: TFn; num: (n: number) => string }) {
  const W = 720, H = 260, pad = { l: 44, r: 16, t: 24, b: 34 };
  const yMin = 70, yMax = 82;
  const x = (i: number) => pad.l + (i * (W - pad.l - pad.r)) / (READINGS.length - 1);
  const y = (v: number) => pad.t + ((yMax - v) * (H - pad.t - pad.b)) / (yMax - yMin);
  const bad = READINGS.findIndex((v) => v < LIMIT);
  const path = READINGS.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const facts: Array<[LucideIcon, string]> = [[TriangleAlert, t("landing.chartFact1")], [Lock, t("landing.chartFact2")], [Factory, t("landing.chartFact3")]];
  return (
    <section className="border-y border-gray-200 bg-white py-20 lg:py-28">
      <div className={`${container} grid gap-12 lg:grid-cols-[1fr_1.35fr] lg:items-center`}>
        <div>
          <p className={eyebrow}>{t("landing.chartEyebrow")}</p>
          <h2 className={h2}>{t("landing.chartTitle")}</h2>
          <p className="mt-5 leading-relaxed text-gray-600">{t("landing.chartLead")}</p>
          <ul className="mt-8 space-y-4">
            {facts.map(([Icon, text]) => (
              <li key={text} className="flex items-start gap-3 text-sm font-medium text-gray-800">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-red-50 text-red-700"><Icon aria-hidden="true" className="h-4 w-4" /></span>
                <span className="pt-1.5">{text}</span>
              </li>
            ))}
          </ul>
        </div>
        <figure className="rounded-2xl border border-gray-200 bg-[#fbfcfb] p-4 sm:p-6">
          <figcaption className="mb-3 flex items-center justify-between gap-3 text-xs text-gray-500">
            <span className="inline-flex items-center gap-1.5 font-medium text-gray-700"><Thermometer aria-hidden="true" className="h-4 w-4 text-brand-600" />CCP-1 · {t("landing.chartAxis")}</span>
          </figcaption>
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t("landing.chartAria")} className="h-auto w-full overflow-visible">
            <rect x={pad.l} y={y(LIMIT)} width={W - pad.l - pad.r} height={y(yMin) - y(LIMIT)} fill="#fdecea" opacity="0.7" />
            {[72, 75, 78, 81].map((v) => (
              <g key={v}>
                <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke={v === LIMIT ? "#c0392b" : "#e5ebe7"} strokeDasharray={v === LIMIT ? "6 5" : undefined} strokeWidth={v === LIMIT ? 1.5 : 1} />
                <text x={pad.l - 10} y={y(v) + 4} textAnchor="end" className="fill-gray-400 font-mono text-[11px]">{v}</text>
              </g>
            ))}
            <text x={W - pad.r} y={y(LIMIT) - 8} textAnchor="end" className="fill-red-700 font-mono text-[11px] font-semibold">{t("landing.chartLimit")}</text>
            <path d={path} fill="none" stroke="#1f9d63" strokeWidth="2" strokeLinejoin="round" />
            {READINGS.map((v, i) => (
              <circle key={i} cx={x(i)} cy={y(v)} r={i === bad ? 6 : 3.5} fill={i === bad ? "#c0392b" : "#fff"} stroke={i === bad ? "#fff" : "#1f9d63"} strokeWidth={i === bad ? 2.5 : 2} />
            ))}
            {READINGS.map((_, i) => (
              <text key={i} x={x(i)} y={H - 10} textAnchor="middle" className="fill-gray-400 font-mono text-[10px]">{String(i + 1).padStart(2, "0")}</text>
            ))}
            {/* Callout sits left of the out-of-limit point, inside the red zone, so it never leaves the plot. */}
            <g transform={`translate(${x(bad) - 228},${y(READINGS[bad]!) - 22})`}>
              <rect width="214" height="44" rx="8" fill="#fff" stroke="#f3c5bf" />
              <text x="12" y="19" className="fill-red-700 font-mono text-[13px] font-semibold">{num(READINGS[bad]!)} °C</text>
              <text x="12" y="35" className="fill-gray-600 text-[11px]">{t("landing.chartEvent")}</text>
            </g>
          </svg>
        </figure>
      </div>
    </section>
  );
}

function DashboardShowcase({ t, num }: { t: TFn; num: (n: number) => string }) {
  const nav: Array<[LucideIcon, string, boolean]> = [
    [LayoutDashboard, t("nav.dashboard"), true], [ClipboardCheck, t("nav.checklists"), false], [Thermometer, t("nav.ccp"), false],
    [TriangleAlert, t("nav.deviations"), false], [Wrench, t("nav.capa"), false], [FileText, t("nav.documents"), false], [ShieldCheck, t("nav.haccp"), false],
    [Truck, t("nav.suppliers"), false], [Boxes, t("nav.lots"), false], [Route, t("nav.trace"), false],
  ];
  const stats: Array<[string, string, string, "red" | "amber" | "ink" | "green"]> = [
    [t("dashboard.openDeviations"), "1", t("dashboard.highCritical", { n: 1 }), "red"],
    [t("dashboard.ccpCompliance"), `${num(87.5)}%`, t("dashboard.ccpRecords", { n: 8 }), "red"],
    [t("dashboard.draftControls"), "5", t("dashboard.awaitingReview"), "amber"],
    [t("dashboard.batchesOnHold"), "1", t("dashboard.overdueCapa") + ": 0", "ink"],
  ];
  const tone = { red: "text-red-700", amber: "text-amber-700", ink: "text-ink", green: "text-green-700" };
  return (
    <section id="fitur" className="scroll-mt-20 py-20 lg:py-28">
      <div className={container}>
        <div className="max-w-2xl">
          <p className={eyebrow}>{t("landing.dashEyebrow")}</p>
          <h2 className={h2}>{t("landing.dashTitle")}</h2>
          <p className="mt-5 leading-relaxed text-gray-600">{t("landing.dashLead")}</p>
        </div>
        <figure className="mt-12">
          {/* Illustration of the real dashboard; hidden from screen readers, described by the caption. */}
          <div aria-hidden="true" className="overflow-hidden rounded-2xl border border-gray-200 bg-[#f6f8f7] shadow-[0_30px_60px_-30px_rgba(16,35,27,0.35)]">
            <div className="flex">
              <div className="hidden w-52 shrink-0 border-r border-gray-200 bg-white p-3 md:block">
                <div className="px-2 py-1"><Logo small /></div>
                <div className="mt-3 rounded-md border border-gray-200 bg-gray-50 px-2 py-1.5 text-[11px] font-semibold">{t("landing.demoOrg")}</div>
                <div className="mt-3 space-y-0.5">
                  {nav.map(([Icon, label, active]) => (
                    <div key={label} className={`flex h-7 items-center gap-2 rounded-md px-2 text-[12px] font-medium ${active ? "bg-brand-50 text-brand-800" : "text-gray-600"}`}>
                      <Icon className={`h-3.5 w-3.5 ${active ? "text-brand-600" : "text-gray-400"}`} />{label}
                      {label === t("nav.deviations") && <span className="ml-auto rounded-full bg-red-600 px-1.5 font-mono text-[10px] leading-4 text-white">1</span>}
                    </div>
                  ))}
                </div>
              </div>
              <div className="min-w-0 flex-1 p-4 sm:p-6">
                <div className="text-base font-semibold">{t("dashboard.title")}</div>
                <div className="text-[11px] text-gray-500">{t("dashboard.subtitle", { date: "28/10/2026 07:30 WIB" })}</div>
                <div className="mt-4 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
                  {stats.map(([label, value, hint, c]) => (
                    <div key={label} className="rounded-lg border border-gray-200 bg-white p-3">
                      <div className="truncate text-[10px] font-semibold uppercase tracking-wide text-gray-500">{label}</div>
                      <div className={`mt-1 text-xl font-semibold ${tone[c]}`}>{value}</div>
                      <div className="truncate text-[10px] text-gray-500">{hint}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 grid gap-2.5 lg:grid-cols-[1.4fr_1fr]">
                  <div className="rounded-lg border border-amber-200 bg-white p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 text-[12px] font-semibold"><Sparkles className="h-3.5 w-3.5 text-amber-600" />{t("dashboard.draftControls")}</span>
                      <span className="rounded-full bg-amber-100 px-2 text-[10px] font-medium leading-5 text-amber-800">{t("dashboard.awaitingReview")}</span>
                    </div>
                    <ul className="mt-2 divide-y divide-gray-100 text-[11.5px]">
                      {[["CCP-1", t("landing.dashDraft1"), "≥ 75 °C"], ["CCP-2", t("landing.dashDraft2"), `Fe ≤ ${num(1.5)} mm`], ["CCP-3", t("landing.dashDraft3"), "≤ -18 °C"]].map(([code, name, lim]) => (
                        <li key={code} className="flex items-center justify-between gap-2 py-1.5">
                          <span className="truncate"><span className="mr-2 font-mono text-gray-500">{code}</span>{name}</span>
                          <span className="shrink-0 font-mono text-gray-700">{lim}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-white p-3">
                    <div className="text-[12px] font-semibold">{t("dashboard.certificates")}</div>
                    <ul className="mt-2 space-y-1.5 text-[11.5px]">
                      <li className="flex items-center justify-between gap-2"><span className="truncate text-brand-700">PT Tepung Makmur · SPPT-SNI</span><span className="shrink-0 rounded-full bg-red-100 px-2 text-[10px] leading-5 text-red-800">{t("certState.EXPIRED")}</span></li>
                      <li className="flex items-center justify-between gap-2"><span className="truncate text-brand-700">CV Ayam Segar Priangan · Halal</span><span className="shrink-0 rounded-full bg-amber-100 px-2 text-[10px] leading-5 text-amber-800">{t("certState.EXPIRING")}</span></li>
                    </ul>
                  </div>
                </div>
                <div className="mt-3 rounded-lg border border-gray-200 bg-white p-3">
                  <div className="text-[12px] font-semibold">{t("dashboard.recentDeviations")}</div>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11.5px]">
                    <span className="text-brand-700"><span className="font-mono">DEV-2026-0001</span> · CCP-1 · {t("ccp.outside")} · {num(72.8)} °C</span>
                    <span className="flex gap-1.5">
                      <span className="rounded-full bg-red-100 px-2 text-[10px] leading-5 text-red-800">{t("severity.HIGH")}</span>
                      <span className="rounded-full bg-blue-100 px-2 text-[10px] leading-5 text-blue-800">{t("devStatus.CAPA_IN_PROGRESS")}</span>
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <figcaption className="mt-3 text-center text-xs text-gray-500">{t("landing.dashCaption")}</figcaption>
        </figure>
      </div>
    </section>
  );
}

function Features({ t }: { t: TFn }) {
  const items: Array<[LucideIcon, string, string]> = [
    [Truck, t("landing.features.suppliersT"), t("landing.features.suppliersD")],
    [Route, t("landing.features.traceT"), t("landing.features.traceD")],
    [FileChartColumn, t("landing.features.reportsT"), t("landing.features.reportsD")],
    [History, t("landing.features.auditT"), t("landing.features.auditD")],
    [PlugZap, t("landing.features.apiT"), t("landing.features.apiD")],
    [Users, t("landing.features.rolesT"), t("landing.features.rolesD")],
  ];
  return (
    <section className="border-t border-gray-200 bg-white py-20 lg:py-28">
      <div className={container}>
        <p className={eyebrow}>{t("landing.featuresEyebrow")}</p>
        <h2 className={`${h2} max-w-2xl`}>{t("landing.featuresTitle")}</h2>
        <dl className="mt-12 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {items.map(([Icon, title, desc]) => (
            <div key={title} className="border-t border-gray-200 pt-5">
              <dt className="flex items-center gap-2.5 font-semibold text-ink"><Icon aria-hidden="true" className="h-[18px] w-[18px] text-brand-600" />{title}</dt>
              <dd className="mt-2 text-sm leading-relaxed text-gray-600">{desc}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

function AiByok({ t }: { t: TFn }) {
  const points: Array<[LucideIcon, string, string]> = [
    [KeyRound, t("landing.aiP1t"), t("landing.aiP1d")],
    [Lock, t("landing.aiP2t"), t("landing.aiP2d")],
    [Sparkles, t("landing.aiP3t"), t("landing.aiP3d")],
  ];
  return (
    <section id="ai" className="scroll-mt-20 bg-ink py-20 text-white lg:py-28">
      <div className={`${container} grid gap-12 lg:grid-cols-[1.1fr_1fr] lg:items-center`}>
        <div>
          <p className="font-mono text-xs font-medium uppercase tracking-[0.14em] text-brand-200">{t("landing.aiEyebrow")}</p>
          <h2 className="mt-3 text-3xl font-bold tracking-[-0.025em] sm:text-4xl">{t("landing.aiTitle")}</h2>
          <p className="mt-5 leading-relaxed text-white/70">{t("landing.aiLead")}</p>
          <ul className="mt-10 space-y-6">
            {points.map(([Icon, title, desc]) => (
              <li key={title} className="flex gap-4">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/10 text-brand-200"><Icon aria-hidden="true" className="h-[18px] w-[18px]" /></span>
                <span><span className="block font-semibold">{title}</span><span className="mt-1 block text-sm leading-relaxed text-white/65">{desc}</span></span>
              </li>
            ))}
          </ul>
        </div>
        {/* Illustration of Settings → AI; decorative. */}
        <div aria-hidden="true" className="rounded-2xl bg-white p-5 text-ink shadow-2xl sm:p-6">
          <div className="text-sm font-semibold">{t("settings.aiByokTitle")}</div>
          <div className="mt-4 space-y-3.5 text-sm">
            {[[t("settings.aiProvider"), t("settings.aiProviders.anthropic"), false], [t("settings.aiModel"), "claude-sonnet-5-5", true], ["API key", "••••••••••••••••  …4f2a", true]].map(([label, value, mono]) => (
              <div key={String(label)}>
                <div className="label">{label}</div>
                <div className={`rounded-md border border-gray-300 bg-white px-3 py-2 ${mono ? "font-mono text-[13px]" : ""}`}>{value}</div>
              </div>
            ))}
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <span className="rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white">{t("settings.aiSave")}</span>
            <span className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium">{t("settings.aiTest")}</span>
          </div>
          <div className="mt-4 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">{t("ok.ai_test_ok")}</div>
        </div>
      </div>
    </section>
  );
}

function Closing({ t }: { t: TFn }) {
  return (
    <section className="py-20 lg:py-28">
      <div className={`${container} grid gap-10 lg:grid-cols-2 lg:gap-16`}>
        <div className="rounded-xl border border-gray-200 border-l-4 border-l-amber-400 bg-white p-6">
          <h2 className="text-base font-semibold text-ink">{t("landing.noteTitle")}</h2>
          <p className="mt-2 text-sm leading-relaxed text-gray-600">{t("landing.noteBody")}</p>
        </div>
        <div>
          <h2 className="text-3xl font-bold tracking-[-0.025em] text-ink sm:text-4xl">{t("landing.finalTitle")}</h2>
          <p className="mt-4 leading-relaxed text-gray-600">{t("landing.finalLead")}</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/register" className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-3 text-sm font-semibold text-white hover:bg-brand-700">{t("landing.register")}<ArrowRight aria-hidden="true" className="h-4 w-4" /></Link>
            <Link href="/login" className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-5 py-3 text-sm font-semibold text-gray-800 hover:bg-gray-50">{t("landing.login")}</Link>
          </div>
        </div>
      </div>
    </section>
  );
}
