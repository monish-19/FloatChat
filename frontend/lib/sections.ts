export const DASHBOARD_SECTIONS = [
  { id: 'telemetry', num: '01', label: 'Telemetry' },
  { id: 'traces', num: '02', label: 'Traces' },
  { id: 'transects', num: '03', label: 'Transects' },
  { id: 'anomalies', num: '04', label: 'Anomalies' },
] as const;

export type DashboardSectionId = (typeof DASHBOARD_SECTIONS)[number]['id'];

export function sectionIndex(id: DashboardSectionId): number {
  return DASHBOARD_SECTIONS.findIndex((s) => s.id === id);
}
