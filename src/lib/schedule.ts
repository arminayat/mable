export const schedules = ["off", "15m", "1h", "24h"] as const;
export type Schedule = typeof schedules[number];

export const scheduleMinutes: Record<Schedule, number> = { off: 0, "15m": 15, "1h": 60, "24h": 1440 };
export const scheduleOptions = [
  { id: "off", label: "Off" },
  { id: "15m", label: "Every 15 minutes" },
  { id: "1h", label: "Every hour" },
  { id: "24h", label: "Every 24 hours" },
];

export function nextScheduledRun(schedule: Schedule, now = new Date()) {
  return schedule === "off" ? null : new Date(now.getTime() + scheduleMinutes[schedule] * 60_000);
}
