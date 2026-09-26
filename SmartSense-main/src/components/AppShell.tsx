import { Link, useLocation } from "react-router-dom";
import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import {
  Activity,
  AlarmClock,
  BarChart3,
  Bell,
  ChevronsLeft,
  ChevronsRight,
  Gauge as GaugeIcon,
  Heart,
  History,
  Home,
  Languages,
  Map as MapIcon,
  Menu,
  Moon,
  Radio,
  Settings as SettingsIcon,
  ShieldCheck,
  Sparkles,
  Sun,
  Target,
  WifiOff,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { languageNames, useSmartSense, type Language, type ThemeMode } from "@/lib/smartsense";

interface NavItem {
  to: string;
  labelKey: string;
  icon: LucideIcon;
}

interface NavGroup {
  labelKey: string;
  items: NavItem[];
}

export const navGroups: NavGroup[] = [
  {
    labelKey: "monitoringGroup",
    items: [
      { to: "/overview", labelKey: "overview", icon: Home },
      { to: "/live-monitor", labelKey: "liveMonitor", icon: Radio },
      { to: "/drowsiness", labelKey: "drowsiness", icon: Activity },
      { to: "/alerts", labelKey: "alerts", icon: Bell },
    ],
  },
  {
    labelKey: "restRecoveryGroup",
    items: [
      { to: "/trip-planner", labelKey: "tripPlanner", icon: MapIcon },
      { to: "/rest", labelKey: "restManagement", icon: Target },
      { to: "/sleep-recovery", labelKey: "sleepRecovery", icon: Moon },
    ],
  },
  {
    labelKey: "insightsGroup",
    items: [
      { to: "/history", labelKey: "history", icon: History },
      { to: "/reports", labelKey: "reports", icon: BarChart3 },
    ],
  },
  {
    labelKey: "systemGroup",
    items: [{ to: "/settings", labelKey: "settings", icon: SettingsIcon }],
  },
];

/* -------------------------------------------------------------------------- */
/* Animated number — smooth count-up/down whenever `value` changes            */
/* -------------------------------------------------------------------------- */

function useAnimatedNumber(value: number, duration = 950) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const rafRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    if (from === to) return;
    if (typeof window === "undefined") {
      setDisplay(to);
      fromRef.current = to;
      return;
    }
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      setDisplay(to);
      fromRef.current = to;
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(from + (to - from) * eased);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration]);

  return display;
}

export function AnimatedNumber({ value, decimals = 0, className }: { value: number; decimals?: number; className?: string }) {
  const display = useAnimatedNumber(value);
  return <span className={className}>{display.toFixed(decimals)}</span>;
}

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-3">
      <span
        className={cn(
          "relative grid size-11 shrink-0 place-items-center rounded-2xl font-display text-lg font-extrabold",
          light ? "bg-white/20 text-white" : "glow-primary bg-gradient-to-br from-primary to-[var(--primary-2)] text-primary-foreground",
        )}
      >
        <Heart size={19} fill="currentColor" strokeWidth={0} />
      </span>
      <span>
        <span className={cn("block font-display text-[16px] font-bold leading-none tracking-tight", light ? "text-white" : "text-foreground")}>
          SmartSense
        </span>
        <span className={cn("mt-1.5 block text-[11px] uppercase tracking-[0.12em]", light ? "text-white/70" : "text-muted-foreground")}>
          Predict · Rest · Recover
        </span>
      </span>
    </Link>
  );
}

export function Button({
  children,
  className,
  variant = "primary",
  size = "md",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
}) {
  const styles: Record<string, string> = {
    primary:
      "bg-gradient-to-br from-primary to-[var(--primary-2)] text-primary-foreground shadow-[0_8px_24px_-8px_var(--glow-primary)] btn-glow",
    secondary: "bg-secondary text-secondary-foreground border border-border hover:bg-accent hover-lift",
    ghost: "bg-transparent text-foreground hover:bg-accent hover-lift",
    danger: "bg-gradient-to-br from-destructive to-destructive text-destructive-foreground shadow-[0_8px_24px_-8px_var(--glow-danger)] hover:brightness-[1.06] hover-lift",
  };
  return (
    <button
      className={cn(
        "group press-scale inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0",
        size === "sm" ? "min-h-8 px-3.5 py-1.5 text-xs" : "min-h-11 px-5 py-2.5 text-sm",
        styles[variant],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export type PillTone = "default" | "good" | "warn" | "danger" | "dark";

export function Pill({ children, tone = "default", live = false }: { children: ReactNode; tone?: PillTone; live?: boolean }) {
  const styles: Record<string, string> = {
    default: "bg-secondary text-secondary-foreground",
    good: "bg-success/15 text-success ring-1 ring-success/25",
    warn: "bg-warning/15 text-warning ring-1 ring-warning/25",
    danger: "bg-destructive/15 text-destructive ring-1 ring-destructive/25",
    dark: "bg-gradient-to-r from-primary to-[var(--primary-2)] text-primary-foreground",
  };
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium backdrop-blur-sm", styles[tone])}>
      <span className={cn("size-1.5 rounded-full bg-current", live && "status-dot")} />
      {children}
    </span>
  );
}

export function Card({
  children,
  className,
  tone,
  id,
  staggerIndex,
}: {
  children: ReactNode;
  className?: string;
  tone?: "warn" | "danger" | "success" | "primary";
  id?: string;
  staggerIndex?: 0 | 1 | 2 | 3 | 4 | 5;
}) {
  const toneStyles: Record<string, string> = {
    warn: "bg-warning/10 border-warning/25 shadow-[0_18px_50px_-20px_var(--glow-warning)]",
    danger: "bg-destructive/10 border-destructive/25 shadow-[0_18px_50px_-20px_var(--glow-danger)]",
    success: "bg-success/10 border-success/25 shadow-[0_18px_50px_-20px_var(--glow-success)]",
    primary: "bg-gradient-to-br from-primary to-[var(--primary-2)] text-primary-foreground border-transparent",
  };
  const staggerClass = staggerIndex !== undefined ? `card-enter-${staggerIndex}` : "card-enter";
  return (
    <section
      id={id}
      className={cn(
        "soft-card hover-lift scroll-mt-24 rounded-[1.75rem] bg-card p-5 sm:p-6",
        staggerClass,
        tone && toneStyles[tone],
        className,
      )}
    >
      {children}
    </section>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <p className="text-[11px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">{children}</p>;
}

export function Metric({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "warn" | "danger" | "success" }) {
  return (
    <Card tone={tone} className="h-full">
      <SectionLabel>{label}</SectionLabel>
      <p className="mt-2 font-display text-2xl font-extrabold tracking-tight">{value}</p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Gauge — layered, glowing ring readout with concentric glass disc & core   */
/* -------------------------------------------------------------------------- */

export function Gauge({ score, size = 220 }: { score: number; size?: number }) {
  const clamped = Math.max(0, Math.min(100, score));
  const tone =
    clamped >= 80 ? "var(--color-success)" : clamped >= 60 ? "var(--color-primary)" : clamped >= 40 ? "var(--color-warning)" : "var(--color-destructive)";
  const statusText = clamped >= 80 ? "Optimal" : clamped >= 60 ? "Stable" : clamped >= 40 ? "Watch" : "Critical";

  const viewBox = 200;
  const center = viewBox / 2;
  const radius = 84;
  const strokeWidth = 12;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - clamped / 100);

  // Animate arc from 0 on initial mount: start at full offset (empty), spring smoothly to real value
  const [animatedOffset, setAnimatedOffset] = useState(circumference);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setAnimatedOffset(dashOffset));
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // After mount, follow live score changes normally via dashOffset
  const displayOffset = animatedOffset === circumference ? circumference : dashOffset;

  const ticks = Array.from({ length: 60 }, (_, i) => i);

  return (
    <div className="relative mx-auto flex items-center justify-center select-none" style={{ width: size, height: size }}>
      {/* 1. Ambient soft glow behind the instrument */}
      <div
        className="pointer-events-none absolute inset-[4%] rounded-full opacity-60 blur-2xl transition-[background] duration-1000"
        style={{ background: `radial-gradient(circle, ${tone} 0%, transparent 68%)` }}
      />

      {/* 2. Main SVG instrument: tick marks, base track, glowing progress arc */}
      <svg viewBox={`0 0 ${viewBox} ${viewBox}`} className="pointer-events-none absolute inset-0 h-full w-full -rotate-90">
        {/* Tick marks */}
        {ticks.map((i) => {
          const angle = (i / ticks.length) * 360;
          const major = i % 5 === 0;
          const r1 = radius + strokeWidth / 2 + 3;
          const r2 = r1 + (major ? 6 : 3);
          const rad = (angle * Math.PI) / 180;
          const x1 = center + r1 * Math.cos(rad);
          const y1 = center + r1 * Math.sin(rad);
          const x2 = center + r2 * Math.cos(rad);
          const y2 = center + r2 * Math.sin(rad);
          const lit = angle <= (clamped / 100) * 360;
          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={lit ? tone : "var(--gauge-track)"}
              strokeWidth={major ? 2 : 1}
              strokeLinecap="round"
              opacity={lit ? 0.85 : 0.45}
            />
          );
        })}

        {/* Track background */}
        <circle cx={center} cy={center} r={radius} fill="none" stroke="var(--gauge-track)" strokeWidth={strokeWidth} />

        {/* Progress arc — smoothly glides into place on mount and updates calmly */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={tone}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={displayOffset}
          style={{
            transition: "stroke-dashoffset 1.3s cubic-bezier(0.22, 1, 0.36, 1), stroke 0.6s ease",
            filter: `drop-shadow(0 0 10px ${tone})`,
          }}
        />
      </svg>

      {/* 3. Slow-rotating dashed halo for ambient depth */}
      <svg viewBox={`0 0 ${viewBox} ${viewBox}`} className="spin-slow pointer-events-none absolute inset-0 h-full w-full opacity-35">
        <circle cx={center} cy={center} r={radius + 18} fill="none" stroke={tone} strokeWidth={1} strokeDasharray="1 10" strokeLinecap="round" />
      </svg>

      {/* 4. Inner circular glass plate - perfectly concentric within the ring */}
      <div className="soft-card pointer-events-none absolute inset-[21%] rounded-full bg-card/85 backdrop-blur-md" />

      {/* 5. Centered readout core */}
      <div className="relative z-10 flex flex-col items-center justify-center text-center">
        <span className="font-display text-4xl sm:text-5xl font-extrabold leading-none tracking-tight tabular-nums">
          <AnimatedNumber value={Math.round(clamped)} />
        </span>
        <span className="mt-1 text-[11px] font-medium text-muted-foreground">/ 100 vigilance</span>
        <span
          className="mt-1.5 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
          style={{ color: tone, background: `color-mix(in oklch, ${tone} 15%, transparent)` }}
        >
          <Sparkles size={10} /> {statusText}
        </span>
      </div>
    </div>
  );
}

export function Sparkline({ values, color = "var(--color-primary)", height = 100 }: { values: number[]; color?: string; height?: number }) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = Math.max(max - min, 1);
  const points = values.map((v, i) => `${(i / (values.length - 1)) * 100},${100 - ((v - min) / range) * 100}`).join(" ");
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ height }} className="w-full overflow-visible">
      <polyline points={`0,100 ${points} 100,100`} fill={color} opacity="0.12" />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        vectorEffect="non-scaling-stroke"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ filter: `drop-shadow(0 0 4px ${color})` }}
      />
    </svg>
  );
}

function ScopeFrame({ children, live }: { children: ReactNode; live?: boolean }) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-secondary/40">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{ backgroundImage: "linear-gradient(var(--grid-line) 1px, transparent 1px), linear-gradient(90deg, var(--grid-line) 1px, transparent 1px)", backgroundSize: "22px 22px" }}
      />
      {live && (
        <span className="absolute right-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-full bg-background/70 px-2 py-1 text-[10px] font-semibold text-success backdrop-blur-sm">
          <span className="status-dot size-1.5 rounded-full bg-success" /> LIVE
        </span>
      )}
      <div className="relative">{children}</div>
    </div>
  );
}

export function Waveform({ variant = "eeg", height = 90, live = true }: { variant?: "eeg" | "eog" | "rest"; height?: number; live?: boolean }) {
  const paths: Record<string, string> = {
    eog: "M0 58 C24 58 28 57 37 35 S52 18 62 55 S84 77 104 55 S124 25 142 52 S166 82 190 57 S215 17 235 52 S258 78 280 56 S306 26 330 55 S355 74 380 56 S407 22 430 51 S455 79 480 55 S508 29 540 55 S565 72 600 53",
    rest: "M0 52 C30 48 40 56 60 50 S90 47 115 54 S145 58 170 50 S200 44 230 51 S260 58 285 48 S315 44 345 52 S375 59 405 50 S435 43 465 50 S500 59 530 51 S570 44 600 52",
    eeg: "M0 52 L14 48 L27 55 L41 38 L53 64 L65 47 L75 54 L86 44 L99 58 L111 27 L122 70 L134 48 L147 54 L161 43 L174 55 L187 49 L200 59 L213 34 L223 65 L237 48 L251 53 L263 42 L276 57 L290 46 L301 54 L314 29 L325 68 L337 48 L351 54 L365 42 L378 57 L391 47 L405 55 L418 36 L430 65 L444 48 L459 53 L473 43 L487 56 L500 48 L514 53 L528 34 L540 65 L555 48 L570 54 L586 44 L600 53",
  };
  const toneClass = variant === "eog" ? "text-success" : "text-primary";
  return (
    <ScopeFrame live={live}>
      <div style={{ height }} className="w-full">
        <svg viewBox="0 0 600 100" preserveAspectRatio="none" className="h-full w-full">
          <defs>
            <linearGradient id={`wf-fill-${variant}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.28" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={`${paths[variant]} L600 100 L0 100 Z`} fill={`url(#wf-fill-${variant})`} className={toneClass} />
          <path
            d={paths[variant]}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            className={cn(toneClass, live && "signal-line")}
            style={{ filter: "drop-shadow(0 0 5px currentColor)" }}
          />
        </svg>
      </div>
    </ScopeFrame>
  );
}

/** Real live-data waveform (not decorative) — plots the last N raw samples straight from the ESP32
 * live stream. Separate from Waveform above, which is the SIMULATION-mode decorative animation. */
export function LiveWaveform({ samples, height = 90, tone = "primary" }: { samples: number[]; height?: number; tone?: "primary" | "success" }) {
  const width = 600;
  const toneClass = tone === "success" ? "text-success" : "text-primary";
  const path = (() => {
    if (samples.length < 2) return "";
    const min = Math.min(...samples);
    const max = Math.max(...samples);
    const span = max - min || 1;
    const stepX = width / (samples.length - 1);
    return samples
      .map((v, i) => {
        const x = i * stepX;
        const y = height - 8 - ((v - min) / span) * (height - 16);
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");
  })();
  return (
    <ScopeFrame live={samples.length >= 2}>
      <div style={{ height }} className="w-full">
        {samples.length < 2 ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">Waiting for data…</div>
        ) : (
          <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="h-full w-full">
            <defs>
              <linearGradient id={`lwf-fill-${tone}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="currentColor" stopOpacity="0.25" />
                <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={`${path} L${width} ${height} L0 ${height} Z`} fill={`url(#lwf-fill-${tone})`} className={toneClass} />
            <path d={path} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={toneClass} style={{ filter: "drop-shadow(0 0 5px currentColor)" }} />
          </svg>
        )}
      </div>
    </ScopeFrame>
  );
}

export function EmptyState({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
  return (
    <Card className="flex flex-col items-center justify-center gap-3 py-14 text-center">
      <span className="glow-primary grid size-14 place-items-center rounded-full bg-secondary text-muted-foreground">
        <Icon size={24} />
      </span>
      <h3 className="font-display text-lg font-bold">{title}</h3>
      <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
    </Card>
  );
}

export function PageIntro({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return (
    <div className="card-enter flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <SectionLabel>{eyebrow}</SectionLabel>
        <h2 className="mt-1.5 font-display text-3xl font-extrabold tracking-tight lg:text-4xl">{title}</h2>
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  );
}

export function SafetyStageStrip() {
  const { state, dispatch, t } = useSmartSense();
  const order = ["DETECT", "PREDICT", "ALERT", "REST", "RECOVER", "RESUME"] as const;
  const stageFriendly: Record<string, string> = {
    DETECT: "Sensing", PREDICT: "Predicting", ALERT: "Alerting", REST: "Resting", RECOVER: "Recovering", RESUME: "Back on the road",
  };
  const stageCopy: Record<string, string> = {
    DETECT: "Reading EEG · EOG", PREDICT: "Watching the trend", ALERT: "Getting your attention", REST: "Finding a safe stop", RECOVER: "Tracking sleep quality", RESUME: "Ready to drive",
  };
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <SectionLabel>Your safety journey</SectionLabel>
          <p className="mt-1 font-display text-lg font-bold">Predict · Rest · Recover</p>
        </div>
        <Pill tone="dark" live>{stageFriendly[state.safetyStage]}</Pill>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {order.map((stage) => (
          <button
            key={stage}
            onClick={() => dispatch({ type: "setStage", stage })}
            className={cn(
              "press-scale rounded-2xl p-3.5 text-left transition hover:-translate-y-0.5",
              state.safetyStage === stage ? "bg-primary/10 ring-2 ring-primary shadow-[0_0_24px_-8px_var(--glow-primary)]" : "bg-secondary/60 hover:bg-secondary",
            )}
          >
            <p className="font-display text-sm font-bold">{stageFriendly[stage]}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">{stageCopy[stage]}</p>
          </button>
        ))}
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">{t("prototypeNote")}</p>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Sidebar — collapsible glass panel, active-route glow, smooth transitions   */
/* -------------------------------------------------------------------------- */

function Sidebar({
  mobileOpen,
  onClose,
  collapsed,
  onToggleCollapsed,
}: {
  mobileOpen: boolean;
  onClose: () => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const { t, state } = useSmartSense();
  const location = useLocation();

  function content(isCollapsed: boolean) {
    return (
      <div className="flex h-full flex-col p-4">
        <div className={cn("flex items-center pb-5", isCollapsed ? "justify-center px-0" : "px-1")}>
          {isCollapsed ? (
            <Link to="/" className="glow-primary grid size-11 place-items-center rounded-2xl bg-gradient-to-br from-primary to-[var(--primary-2)] text-primary-foreground">
              <Heart size={19} fill="currentColor" strokeWidth={0} />
            </Link>
          ) : (
            <Logo />
          )}
        </div>

        <div className={cn("mb-5 rounded-2xl bg-secondary/50 p-3.5", isCollapsed && "px-2")}>
          <div className={cn("flex items-center gap-3", isCollapsed && "justify-center")}>
            <div className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/15 font-display text-sm font-bold text-primary">
              <Heart size={17} fill="currentColor" strokeWidth={0} />
            </div>
            {!isCollapsed && (
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-semibold">{state.operatingMode === "DRIVING" ? "On the road" : "Taking a rest"}</p>
                <p className="truncate text-[12px] text-muted-foreground">{state.operatingMode === "DRIVING" ? t("drivingMode") : t("restMode")}</p>
              </div>
            )}
          </div>
          {!isCollapsed && (
            <div className="mt-3">
              <Pill tone="good" live>{state.dataSource === "SIMULATION" ? t("simulation") : t("live")}</Pill>
            </div>
          )}
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto overflow-x-hidden">
          {navGroups.map((group) => (
            <div key={group.labelKey}>
              {!isCollapsed && <SectionLabel>{t(group.labelKey)}</SectionLabel>}
              <div className={cn("space-y-1", !isCollapsed && "mt-2")}>
                {group.items.map(({ to, labelKey, icon: Icon }) => {
                  const active = location.pathname === to;
                  return (
                    <Link
                      key={to}
                      to={to}
                      onClick={onClose}
                      title={isCollapsed ? t(labelKey) : undefined}
                      className={cn(
                        "nav-icon-group group relative flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-[14px] font-medium transition-all duration-200",
                        isCollapsed && "justify-center px-0",
                        active
                          ? "bg-gradient-to-r from-primary/20 to-primary/5 text-foreground shadow-[inset_0_0_0_1px_var(--color-border)]"
                          : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground",
                      )}
                    >
                      {active && <span className="nav-accent-bar absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-gradient-to-b from-primary to-[var(--primary-2)] shadow-[0_0_10px_var(--glow-primary)]" />}
                      <Icon size={17} strokeWidth={1.8} className={cn("nav-icon", active ? "text-primary" : undefined)} />
                      {!isCollapsed && <span className="truncate">{t(labelKey)}</span>}
                      {!isCollapsed && labelKey === "restManagement" && state.restDecision !== "CONTINUE" && (
                        <span className="ml-auto size-2 rounded-full bg-warning" />
                      )}
                      {!isCollapsed && labelKey === "alerts" && state.alerts.some((a) => !a.read) && (
                        <span className="ml-auto rounded-full bg-destructive px-1.5 text-[10px] font-bold text-destructive-foreground">
                          {state.alerts.filter((a) => !a.read).length}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <button
          onClick={onToggleCollapsed}
          className="mt-4 hidden items-center justify-center gap-2 rounded-2xl border border-border/70 py-2.5 text-xs font-medium text-muted-foreground transition hover:bg-secondary/70 hover:text-foreground lg:flex"
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {isCollapsed ? <ChevronsRight size={15} /> : (
            <>
              <ChevronsLeft size={15} /> Collapse
            </>
          )}
        </button>

        {!isCollapsed && (
          <div className="mt-4 border-t border-border/60 pt-4">
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              This is a demo experience with simulated data — not a real medical device.
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <aside
        className={cn(
          "sidebar-arrive fixed inset-y-0 left-0 z-50 hidden p-4 transition-[width] duration-300 lg:block",
          collapsed ? "w-[104px]" : "w-[280px]",
        )}
      >
        <div className="glass-panel soft-card-lg sticky top-0 h-[calc(100vh-2rem)] overflow-hidden rounded-[1.75rem]">{content(collapsed)}</div>
      </aside>
      <div className={cn("fixed inset-0 z-50 lg:hidden", mobileOpen ? "pointer-events-auto" : "pointer-events-none")}>
        <button
          className={cn("absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity", mobileOpen ? "opacity-100" : "opacity-0")}
          aria-label="Close menu"
          onClick={onClose}
        />
        <aside
          className={cn(
            "glass-panel absolute inset-y-0 left-0 w-[280px] shadow-2xl transition-transform duration-300",
            mobileOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          {content(false)}
        </aside>
      </div>
    </>
  );
}

function Topbar({ onMenu }: { onMenu: () => void }) {
  const { state, t, language, setLanguage, theme, setTheme } = useSmartSense();
  const location = useLocation();
  const current = navGroups.flatMap((g) => g.items).find((item) => item.to === location.pathname);
  const isLive = state.dataSource === "LIVE";
  const connected = state.eegStatus === "CONNECTED" || (isLive && state.liveConnection === "CONNECTED");

  return (
    <header className="topbar-arrive sticky top-0 z-30 px-3 pt-3 sm:px-5 lg:px-6">
      <div className="glass-panel soft-card mx-auto flex max-w-[1440px] items-center gap-3 rounded-2xl px-4 py-3">
        <button
          className="press-scale grid size-10 shrink-0 place-items-center rounded-full bg-secondary/70 text-muted-foreground hover:bg-accent lg:hidden"
          onClick={onMenu}
          aria-label="Toggle navigation"
        >
          <Menu size={18} />
        </button>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={cn("size-2 rounded-full", connected ? "status-dot bg-success text-success" : "bg-muted-foreground text-muted-foreground")} />
            <h1 className="truncate font-display text-lg font-bold tracking-tight sm:text-xl">{current ? t(current.labelKey) : t("overview")}</h1>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          <Pill tone={state.operatingMode === "REST" ? "good" : "default"}>{state.operatingMode === "REST" ? t("restMode") : t("drivingMode")}</Pill>
          <span className="hidden sm:inline-flex">
            <Pill tone={isLive ? "good" : "default"} live={isLive}>{isLive ? t("live") : t("simulation")}</Pill>
          </span>
          <div className="hidden items-center gap-1 rounded-full bg-secondary/60 p-1 sm:flex">
            <Languages size={14} className="ml-1.5 text-muted-foreground" />
            <select
              aria-label="Language"
              value={language}
              onChange={(e) => setLanguage(e.target.value as Language)}
              className="h-7 rounded-full bg-transparent px-1 text-xs text-foreground outline-none"
            >
              {Object.entries(languageNames).map(([key, name]) => (
                <option key={key} value={key}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div className="hidden items-center gap-1 rounded-full bg-secondary/60 p-1 sm:flex">
            <button
              aria-label="Light theme"
              onClick={() => setTheme("light" as ThemeMode)}
              className={cn("press-scale grid size-7 place-items-center rounded-full transition", theme === "light" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              <Sun size={13} />
            </button>
            <button
              aria-label="Dark theme"
              onClick={() => setTheme("dark" as ThemeMode)}
              className={cn("press-scale grid size-7 place-items-center rounded-full transition", theme === "dark" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              <Moon size={13} />
            </button>
            <button
              aria-label="Automatic theme"
              onClick={() => setTheme("system" as ThemeMode)}
              className={cn("press-scale grid size-7 place-items-center rounded-full transition", theme === "system" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              <GaugeIcon size={13} />
            </button>
          </div>
          <Link
            to="/settings"
            className="glow-primary press-scale grid size-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-primary to-[var(--primary-2)] font-display text-xs font-bold text-primary-foreground"
          >
            <Heart size={16} fill="currentColor" strokeWidth={0} />
          </Link>
        </div>
      </div>
    </header>
  );
}

function NoWearableBanner() {
  const { state, dispatch } = useSmartSense();
  if (state.dataSource !== "LIVE" || state.eegStatus !== "DISCONNECTED") return null;
  return (
    <div className="card-enter mx-auto flex max-w-[1440px] flex-col items-start gap-3 rounded-2xl bg-warning/10 px-4 py-3.5 ring-1 ring-warning/25 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-warning/20 text-warning">
          <WifiOff size={16} />
        </span>
        <p className="text-sm text-warning">
          <span className="font-semibold">No wearable paired yet.</span> You're set to Live hardware mode in Settings, so
          readings are paused until a device connects.
        </p>
      </div>
      <Button size="sm" variant="secondary" className="shrink-0" onClick={() => dispatch({ type: "setDataSource", source: "SIMULATION" })}>
        Use simulated data
      </Button>
    </div>
  );
}

function AlarmBanner() {
  const { state, dispatch, alarmRinging } = useSmartSense();
  if (!alarmRinging) return null;
  return (
    <div className="glow-primary sticky top-0 z-40 flex flex-col items-start gap-3 rounded-2xl bg-gradient-to-br from-primary to-[var(--primary-2)] px-4 py-4 text-primary-foreground shadow-[0_10px_40px_-10px_var(--glow-primary)] sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 animate-pulse place-items-center rounded-full bg-white/20">
          <AlarmClock size={18} />
        </span>
        <div>
          <p className="text-sm font-bold">Smart Alarm — time to wake up</p>
          <p className="text-xs text-primary-foreground/80">
            Vigilance score {state.recoveryAfter} — a good moment to wake was found. Ringing until you respond.
          </p>
        </div>
      </div>
      <Button size="sm" variant="secondary" className="shrink-0 bg-white text-primary hover:opacity-90" onClick={() => dispatch({ type: "wakeUp" })}>
        Stop alarm — I'm awake
      </Button>
    </div>
  );
}

export function DashboardShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem("smartsense-sidebar-collapsed") === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("smartsense-sidebar-collapsed", collapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  return (
    <div className="min-h-screen text-foreground">
      <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} collapsed={collapsed} onToggleCollapsed={() => setCollapsed((c) => !c)} />
      <div className={cn("transition-[padding] duration-300", collapsed ? "lg:pl-[120px]" : "lg:pl-[296px]")}>
        <Topbar onMenu={() => setMobileOpen(true)} />
        <main className="page-arrive mx-auto max-w-[1440px] space-y-6 p-4 sm:p-6 lg:p-8">
          <AlarmBanner />
          <NoWearableBanner />
          {children}
        </main>
      </div>
    </div>
  );
}

export { X, ShieldCheck };
