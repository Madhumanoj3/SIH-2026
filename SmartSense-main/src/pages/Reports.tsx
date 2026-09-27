import jsPDF from "jspdf";
import { Download, FileText } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button, Card, DashboardShell, Metric, PageIntro, Pill, SectionLabel } from "@/components/AppShell";
import { useSmartSense, type DriveRecord } from "@/lib/smartsense";
import { formatDuration } from "@/lib/utils";

const weekly = [
  { day: "Mon", minutes: 96 }, { day: "Tue", minutes: 142 }, { day: "Wed", minutes: 88 },
  { day: "Thu", minutes: 156 }, { day: "Fri", minutes: 138 }, { day: "Sat", minutes: 64 }, { day: "Sun", minutes: 40 },
];

function downloadDrivingReportPdf(record: DriveRecord) {
  const doc = new jsPDF();
  doc.setFontSize(18);
  doc.text("SmartSense — Completed Driving Report", 14, 20);
  doc.setFontSize(11);
  doc.setTextColor(90);
  const lines: [string, string][] = [
    ["Date", record.date],
    ["Route", record.route],
    ["Duration", formatDuration(record.durationMin)],
    ["Distance", `${record.distanceKm} km`],
    ["Average vigilance", String(record.avgVigilance)],
    ["Rest breaks", String(record.restBreaks)],
    ["Outcome", record.outcome],
  ];
  lines.forEach(([label, value], i) => {
    doc.text(`${label}:`, 14, 36 + i * 8);
    doc.text(value, 60, 36 + i * 8);
  });
  doc.setFontSize(9);
  doc.setTextColor(140);
  doc.text("Simulated demo data — SmartSense prototype.", 14, 280);
  const slug = `${record.date}-${record.route}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  doc.save(`${slug}-driving-report.pdf`);
}

export default function Reports() {
  const { state, t } = useSmartSense();

  return (
    <DashboardShell>
      <PageIntro
        eyebrow={`SmartSense / ${t("reports")}`}
        title={t("reports")}
        description="Completed driving reports, ready to download as PDF for records or sharing."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Metric label={t("today")} value={formatDuration(state.drivingMinutesToday)} sub="driving time" />
        <Metric label={t("thisWeek")} value={formatDuration(weekly.reduce((s, d) => s + d.minutes, 0))} sub="driving time" />
        <Metric label="Rest breaks logged" value={String(state.history.reduce((s, d) => s + d.restBreaks, 0))} sub="this period" />
      </div>

      <Card>
        <SectionLabel>Weekly driving report</SectionLabel>
        <div className="mt-5 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weekly} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="day" stroke="var(--color-muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="var(--color-muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 12, fontSize: 12 }} />
              <Bar dataKey="minutes" fill="var(--color-primary)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div>
        <SectionLabel>Completed driving reports</SectionLabel>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {state.history.map((record) => (
            <Card key={record.id}>
              <div className="flex items-start justify-between gap-3">
                <FileText className="text-primary" size={22} />
                <Pill tone={record.outcome === "improved" ? "good" : record.outcome === "watch" ? "warn" : "default"}>{record.outcome}</Pill>
              </div>
              <h3 className="mt-4 font-display text-lg font-bold">{record.date} — {record.route}</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {formatDuration(record.durationMin)} · {record.distanceKm} km · avg vigilance {record.avgVigilance} · {record.restBreaks} rest break{record.restBreaks === 1 ? "" : "s"}
              </p>
              <div className="mt-5">
                <Button className="w-full" onClick={() => downloadDrivingReportPdf(record)}>
                  <Download size={13} /> Download PDF
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </div>

      <Card>
        <p className="text-[11px] text-muted-foreground">
          {t("prototypeNote")} · All figures reflect simulated demo data for this prototype.
        </p>
      </Card>
    </DashboardShell>
  );
}
