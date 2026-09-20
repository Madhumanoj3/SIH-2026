import { useState } from "react";
import { AlertTriangle, Gauge, Loader2, TrendingDown, TrendingUp, Minus } from "lucide-react";
import { Button, Card, DashboardShell, PageIntro, Pill, SectionLabel } from "@/components/AppShell";
import { useSmartSense, vigilanceLabelKey, trendLabelKey, type VigilanceState } from "@/lib/smartsense";
import driveSamples from "@/lib/demoSamples/driveSamples.json";

const episodes = [
  { time: "04:42", state: "DROWSINESS" as VigilanceState, note: "Score dipped for a moment, then recovered." },
  { time: "03:15", state: "FATIGUE" as VigilanceState, note: "A gentle heads-up was shown — nothing urgent." },
  { time: "01:02", state: "ALERT" as VigilanceState, note: "Journey start — fully alert." },
];

// ---------------------------------------------------------------------------
// Real-backend "Analyze Drive Vigilance" integration. Self-contained and
// local to this page, same pattern as SleepRecovery's "Analyze Sleep": a
// click sends ONE real 28-feature Drive Mode row (bundled from a real DROZY
// dataset row — Stage 1 has no ESP32/BioAmp wearable yet) to the FastAPI ML
// backend (finalized XGBoost vigilance regressor + its fitted StandardScaler,
// running locally) and shows the returned vigilance score here. Once real
// hardware exists, only the feature-vector source changes.
// ---------------------------------------------------------------------------
const ML_BACKEND_URL = "http://127.0.0.1:8000";

export default function Drowsiness() {
  const { state, t } = useSmartSense();
  const TrendIcon = state.trend === "IMPROVING" ? TrendingUp : state.trend === "STABLE" ? Minus : TrendingDown;

  const [vigilance, setVigilance] = useState<number | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runDriveAnalysis() {
    setAnalyzing(true);
    setError(null);
    try {
      const sample = driveSamples[Math.floor(Math.random() * driveSamples.length)];
      const res = await fetch(`${ML_BACKEND_URL}/api/predict/drive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sample),
      });
      if (!res.ok) {
        let detail = `Backend returned HTTP ${res.status}`;
        try {
          const body = await res.json();
          if (typeof body?.detail === "string") detail = body.detail;
          else if (body?.detail) detail = JSON.stringify(body.detail);
        } catch {
          // Response wasn't JSON — fall back to the HTTP status above.
        }
        throw new Error(detail);
      }
      const data = await res.json();
      if (typeof data?.vigilance !== "number") {
        throw new Error("Backend response was missing the expected vigilance field.");
      }
      setVigilance(data.vigilance);
    } catch (err) {
      const unreachable = err instanceof TypeError;
      setError(
        unreachable
          ? `Can't reach the ML backend at ${ML_BACKEND_URL}. Make sure it's running (python -m uvicorn main:app --reload from the backend folder).`
          : `Prediction failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <DashboardShell>
      <PageIntro
        eyebrow={t("drowsiness")}
        title={t("drowsiness")}
        description="How alert you're feeling right now, and how it's been trending."
        action={<Pill tone="good">{t("monitoringStatus")}: Active</Pill>}
      />

      <section className="grid gap-6 xl:grid-cols-12">
        <Card className="xl:col-span-4">
          <SectionLabel>{t("drowsinessScore")}</SectionLabel>
          <div className="mt-3 flex items-end gap-2">
            <span className="font-display text-6xl font-extrabold">{state.vigilanceScore}</span>
            <span className="mb-2 text-sm text-muted-foreground">/ 100</span>
          </div>
          <Pill tone={state.vigilanceScore > 69 ? "good" : state.vigilanceScore > 39 ? "warn" : "danger"}>
            {t(vigilanceLabelKey[state.vigilanceState])}
          </Pill>
          <div className="mt-5 h-2 rounded-full bg-secondary">
            <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${state.vigilanceScore}%` }} />
          </div>
          <div className="mt-5 flex items-center gap-2 text-sm text-warning">
            <TrendIcon size={16} /> {t(trendLabelKey[state.trend])}
          </div>
        </Card>

        <Card className="xl:col-span-8">
          <SectionLabel>What this means</SectionLabel>
          <p className="mt-2 font-display text-lg font-bold">
            {state.trend === "IMPROVING" ? "You're feeling more alert." : "Your alertness has been slipping a little."}
          </p>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            {state.trend === "IMPROVING"
              ? "Keep it up — no action needed right now. We'll keep watching quietly in the background."
              : state.trend === "RAPID_DECREASE"
                ? "This is dropping quickly. If it keeps going, we'll suggest a break soon."
                : "This is a normal, gradual dip. We're keeping an eye on it, and we'll say something if it keeps trending down."}
          </p>
        </Card>
      </section>

      {state.dataSource === "SIMULATION" && (
        <Card>
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
              <Gauge size={19} />
            </span>
            <div>
              <SectionLabel>ML Backend demo — Drive Mode vigilance</SectionLabel>
              <h3 className="font-display text-lg font-bold">Analyze Drive Vigilance (sample data)</h3>
            </div>
          </div>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Sends one real bundled feature vector to the FastAPI backend's finalized Drive Mode XGBoost regressor
            (28 features → fitted StandardScaler → vigilance score) and shows the result here. Switch to Live in
            Settings to see continuous predictions from the real ESP32/BioAmp stream instead.
          </p>
          <div className="mt-4">
            <Button variant="secondary" onClick={runDriveAnalysis} disabled={analyzing}>
              {analyzing ? (
                <>
                  Analyzing… <Loader2 size={15} className="animate-spin" />
                </>
              ) : (
                <>
                  Analyze Drive Vigilance <Gauge size={15} />
                </>
              )}
            </Button>
          </div>
          {error && (
            <div className="mt-3 flex items-start gap-3 rounded-2xl bg-destructive/10 p-3.5">
              <AlertTriangle size={16} className="mt-0.5 shrink-0 text-destructive" />
              <p className="text-xs leading-relaxed text-destructive">{error}</p>
            </div>
          )}
          {vigilance != null && !error && (
            <p className="mt-3 text-xs text-muted-foreground">
              Last analysis from the ML backend: <b>{vigilance.toFixed(1)}</b> / 100 vigilance.
            </p>
          )}
        </Card>
      )}

      {state.dataSource === "LIVE" && (
        <Card>
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
              <Gauge size={19} />
            </span>
            <div>
              <SectionLabel>Live ML Backend — Drive Mode vigilance</SectionLabel>
              <h3 className="font-display text-lg font-bold">Real-time vigilance from the ESP32 stream</h3>
            </div>
          </div>
          {!state.liveBackendReachable || state.liveConnection !== "CONNECTED" ? (
            <p className="mt-3 text-sm text-muted-foreground">Monitoring…</p>
          ) : state.liveRecovering ? (
            <div className="mt-3">
              <p className="text-sm text-muted-foreground">Monitoring — refining the live signal…</p>
              <div className="mt-2 h-1.5 rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-500"
                  style={{ width: `${state.liveTargetSamples > 0 ? Math.min(100, (state.liveContiguousSamples / state.liveTargetSamples) * 100) : 0}%` }}
                />
              </div>
            </div>
          ) : state.liveQuality === "POOR" ? (
            <p className="mt-3 text-sm text-muted-foreground">Monitoring…</p>
          ) : state.liveDrivePrediction ? (
            <div className="mt-3 flex items-end gap-6">
              <div>
                <p className="font-display text-4xl font-extrabold">{state.liveDrivePrediction.vigilance.toFixed(1)}</p>
                <p className="text-xs text-muted-foreground">Estimated Vigilance / 100</p>
              </div>
              <div>
                <p className="text-sm font-semibold">{state.liveDrivePrediction.trendLabel}</p>
                <p className="text-xs text-muted-foreground">{state.liveDrivePrediction.status}</p>
              </div>
              <p className="text-xs text-muted-foreground">
                Updated {new Date(state.liveDrivePrediction.timestamp * 1000).toLocaleTimeString()} · ~every 8s
              </p>
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">Buffering the first 8-second window — a prediction appears once it's ready.</p>
          )}
          <p className="mt-3 text-[11px] text-muted-foreground">{t("prototypeNote")} · ML Vigilance Score, not a medical measurement.</p>
        </Card>
      )}

      <Card>
        <SectionLabel>Recent moments</SectionLabel>
        <div className="mt-4 space-y-3">
          {episodes.map((ep) => (
            <div key={ep.time} className="flex items-start gap-3 rounded-2xl bg-secondary/50 p-3.5">
              <span className="mt-0.5 text-[11px] text-muted-foreground">{ep.time}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{t(vigilanceLabelKey[ep.state])}</p>
                <p className="text-xs text-muted-foreground">{ep.note}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </DashboardShell>
  );
}
