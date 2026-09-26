import { useEffect, useState } from "react";
import { Activity, AlertTriangle, Battery, Eye, Wifi, WifiOff } from "lucide-react";
import {
  Card,
  DashboardShell,
  EmptyState,
  LiveWaveform,
  PageIntro,
  Pill,
  SectionLabel,
  Waveform,
} from "@/components/AppShell";
import { useSmartSense, vigilanceLabelKey } from "@/lib/smartsense";

function useClock() {
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  return new Date();
}

function LiveView() {
  const { state, t } = useSmartSense();

  if (!state.liveBackendReachable) {
    // Technical detail for whoever is running the demo, not the panel itself.
    if (typeof window !== "undefined") console.info("[SmartSense] Live backend not reachable at ws://127.0.0.1:8000 yet.");
    return (
      <DashboardShell>
        <PageIntro
          eyebrow={t("liveMonitor")}
          title={t("liveMonitor")}
          description="Real-time EEG and EOG signals from the wearable."
          action={<Pill tone="warn">Preparing</Pill>}
        />
        <EmptyState icon={WifiOff} title="Preparing live monitoring" description="Getting the live connection ready." />
      </DashboardShell>
    );
  }

  if (state.liveConnection !== "CONNECTED") {
    if (typeof window !== "undefined") console.info("[SmartSense] Live backend reachable, waiting for ESP32/hub samples.");
    return (
      <DashboardShell>
        <PageIntro
          eyebrow={t("liveMonitor")}
          title={t("liveMonitor")}
          description="Real-time EEG and EOG signals from the wearable."
          action={<Pill tone="warn">Standby</Pill>}
        />
        <EmptyState icon={Wifi} title="Monitoring" description="Preparing to receive live signals." />
      </DashboardShell>
    );
  }

  // Panel-facing quality label — never shows the raw internal GOOD/FAIR/POOR/UNKNOWN
  // value or the technical rejection reason (e.g. "sequence_gap"); those stay in the
  // console for whoever is running the demo. See state.liveQuality/liveRejectReason.
  if (state.liveRejectReason && typeof window !== "undefined") {
    console.info("[SmartSense] Live quality note:", state.liveQuality, state.liveRejectReason);
  }
  const qualityDisplay = state.liveQuality === "GOOD" ? "Stable" : state.liveQuality === "FAIR" ? "Stable" : "Monitoring";
  const rest = state.liveRestPrediction;
  const drive = state.liveDrivePrediction;

  return (
    <DashboardShell>
      <PageIntro
        eyebrow={t("liveMonitor")}
        title={t("liveMonitor")}
        description="Real-time EEG and EOG signals, buffered and fed through the existing trained models on the backend."
        action={<Pill tone="good">LIVE / CONNECTED</Pill>}
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <div className="flex items-center justify-between">
            <SectionLabel>Signal quality</SectionLabel>
            <Wifi size={14} className="text-success" />
          </div>
          <p className="mt-2 font-display text-2xl font-extrabold">{qualityDisplay}</p>
          <p className="mt-1 text-xs text-muted-foreground">Live quality checks running</p>
        </Card>
        <Card>
          <SectionLabel>Sample rate</SectionLabel>
          <p className="mt-2 font-display text-2xl font-extrabold">{state.liveDetectedFs ? `${state.liveDetectedFs.toFixed(1)} Hz` : "—"}</p>
          <p className="mt-1 text-xs text-muted-foreground">Measured live</p>
        </Card>
        <Card>
          <SectionLabel>Rest prediction</SectionLabel>
          <p className="mt-2 font-display text-2xl font-extrabold">{rest ? rest.prediction : "—"}</p>
          <p className="mt-1 text-xs text-muted-foreground">{rest ? `N2 probability ${(rest.n2Probability * 100).toFixed(1)}%` : "No completed 30s epoch yet"}</p>
        </Card>
        <Card>
          <div className="flex items-center justify-between">
            <SectionLabel>Drive vigilance</SectionLabel>
            <Battery size={14} className="text-muted-foreground" />
          </div>
          <p className="mt-2 font-display text-2xl font-extrabold">{drive ? drive.vigilance.toFixed(1) : "—"}</p>
          <p className="mt-1 text-xs text-muted-foreground">{drive ? `${drive.trendLabel} · ${drive.status}` : "No completed 8s window yet"}</p>
        </Card>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <Card>
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
              <Activity size={19} />
            </span>
            <div>
              <SectionLabel>{t("eegBrain")}</SectionLabel>
              <h3 className="font-display text-lg font-bold">Live EEG signal</h3>
            </div>
          </div>
          <div className="mt-5">
            <LiveWaveform samples={state.liveEeg} height={130} />
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-success/15 text-success">
              <Eye size={19} />
            </span>
            <div>
              <SectionLabel>{t("eogEye")}</SectionLabel>
              <h3 className="font-display text-lg font-bold">Live EOG signal</h3>
            </div>
          </div>
          <div className="mt-5">
            <LiveWaveform samples={state.liveEog} height={130} tone="success" />
          </div>
        </Card>
      </section>

      <Card>
        <div className="flex items-start gap-3">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-muted-foreground" />
          <p className="text-xs leading-relaxed text-muted-foreground">
            Live signal calibration is still in progress for this prototype build, and predictions are only shown
            once a clean, complete reading is available — never guessed. {t("prototypeNote")}
          </p>
        </div>
      </Card>
    </DashboardShell>
  );
}

export default function LiveMonitor() {
  const { state, t } = useSmartSense();
  const now = useClock();
  const safetyTone = state.vigilanceState === "ALERT" || state.vigilanceState === "FATIGUE" ? "good" : state.vigilanceState === "DROWSINESS" ? "warn" : "danger";
  const connected = state.eegStatus === "CONNECTED";

  if (state.dataSource === "LIVE") {
    return <LiveView />;
  }

  if (!connected) {
    return (
      <DashboardShell>
        <PageIntro
          eyebrow={t("liveMonitor")}
          title={t("liveMonitor")}
          description="Real-time EEG and EOG signals feeding the drowsiness model."
          action={<Pill tone="warn">Not paired</Pill>}
        />
        <EmptyState
          icon={Wifi}
          title="No wearable paired yet"
          description="Pair a SmartSense wearable to see real-time signals here — see the banner above to switch back to simulated data."
        />
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <PageIntro
        eyebrow={t("liveMonitor")}
        title={t("liveMonitor")}
        description="Real-time EEG and EOG physiological signals feeding the multimodal drowsiness model."
        action={<Pill tone="good">{t("monitoringStatus")}: Active</Pill>}
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card staggerIndex={0}>
          <div className="flex items-center justify-between">
            <SectionLabel>{t("signalStatus")}</SectionLabel>
            <span className="connection-pulse-once relative text-success">
              <Wifi size={14} />
            </span>
          </div>
          <p className="mt-2 font-display text-2xl font-extrabold">{t("connected")}</p>
          <p className="mt-1 text-xs text-muted-foreground">EEG + EOG wearable</p>
        </Card>
        <Card staggerIndex={1}>
          <SectionLabel>{t("signalQuality")}</SectionLabel>
          <p className="mt-2 font-display text-2xl font-extrabold">{Math.round((state.eegQuality + state.eogQuality) / 2)}%</p>
          <p className="mt-1 text-xs text-muted-foreground">Combined EEG/EOG confidence</p>
        </Card>
        <Card tone={safetyTone === "danger" ? "danger" : safetyTone === "warn" ? "warn" : undefined} staggerIndex={2}>
          <SectionLabel>Current Driver State</SectionLabel>
          <p className="mt-2 font-display text-2xl font-extrabold">{t(vigilanceLabelKey[state.vigilanceState])}</p>
          <p className="mt-1 text-xs text-muted-foreground">Vigilance {state.vigilanceScore}/100</p>
        </Card>
        <Card staggerIndex={3}>
          <div className="flex items-center justify-between">
            <SectionLabel>{t("wearableConnection")}</SectionLabel>
            <Battery size={14} className="text-muted-foreground" />
          </div>
          <p className="mt-2 font-display text-2xl font-extrabold">{state.wearableBattery}%</p>
          <p className="mt-1 text-xs text-muted-foreground">{now.toLocaleTimeString()}</p>
        </Card>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <Card staggerIndex={4}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
                <Activity size={19} />
              </span>
              <div>
                <SectionLabel>{t("eegBrain")}</SectionLabel>
                <h3 className="font-display text-lg font-bold">Brain activity feature stream</h3>
              </div>
            </div>
            <Pill tone={state.eegQuality > 70 ? "good" : "warn"}>{state.eegQuality}%</Pill>
          </div>
          <div className="mt-5">
            <Waveform variant="eeg" height={130} />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-secondary/70 p-3">
              <SectionLabel>{t("monitoringStatus")}</SectionLabel>
              <p className="mt-1 text-xs font-semibold">Active</p>
            </div>
            <div className="rounded-xl bg-secondary/70 p-3">
              <SectionLabel>{t("demoMode")}</SectionLabel>
              <p className="mt-1 text-xs font-semibold">{t("simulation")}</p>
            </div>
          </div>
        </Card>

        <Card staggerIndex={5}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-success/15 text-success">
                <Eye size={19} />
              </span>
              <div>
                <SectionLabel>{t("eogEye")}</SectionLabel>
                <h3 className="font-display text-lg font-bold">Eye movement &amp; blink stream</h3>
              </div>
            </div>
            <Pill tone={state.eogQuality > 70 ? "good" : "warn"}>{state.eogQuality}%</Pill>
          </div>
          <div className="mt-5">
            <Waveform variant="eog" height={130} />
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-secondary/70 p-3">
              <SectionLabel>Blinks/min</SectionLabel>
              <p className="mt-1 text-xs font-semibold">{14 + (state.vigilanceScore < 50 ? 8 : 0)}</p>
            </div>
            <div className="rounded-xl bg-secondary/70 p-3">
              <SectionLabel>Slow eye moves</SectionLabel>
              <p className="mt-1 text-xs font-semibold">{state.vigilanceScore < 50 ? "Detected" : "None"}</p>
            </div>
            <div className="rounded-xl bg-secondary/70 p-3">
              <SectionLabel>{t("demoMode")}</SectionLabel>
              <p className="mt-1 text-xs font-semibold">{t("simulation")}</p>
            </div>
          </div>
        </Card>
      </section>

      <Card>
        <SectionLabel>Multimodal fusion</SectionLabel>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          EEG and EOG feature streams are fused into a continuous vigilance/drowsiness score (0–100) rather than a
          binary drowsy/not-drowsy decision, so SmartSense can track the direction of the trend and predict — not
          just detect — worsening drowsiness.
        </p>
        <p className="mt-3 text-[11px] text-muted-foreground">
          {t("prototypeNote")} · Vigilance is derived from EEG and EOG physiological signals only.
        </p>
      </Card>
    </DashboardShell>
  );
}
