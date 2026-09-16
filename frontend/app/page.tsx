'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import ChatPanel from '@/components/ChatPanel';
import OceanScene, { FloatTrajectory, OceanAnomaly, TransectPoint } from '@/components/OceanScene';

type Metric = { label: string; value: string; delta: string };
type PipelineItem = { step: string; value: string; tone: 'cyan' | 'teal' | 'amber'; width: string };

type Transect = {
  variable: 'temperature' | 'salinity';
  distance_km: number[];
  depths: number[];
  grid: { depth: number; values: (number | null)[] }[];
};

export default function Page() {
  const [pipeline, setPipeline] = useState<PipelineItem[]>([]);
  const [pipelineTotal, setPipelineTotal] = useState('—');
  const [metrics, setMetrics] = useState<Metric[]>([
    { label: 'Profiles ingested', value: '—', delta: 'Loading live state' },
    { label: 'Detected anomalies', value: '—', delta: 'Loading live state' },
    { label: 'Backend status', value: '—', delta: 'Checking connection' },
    { label: 'Last telemetry', value: '—', delta: 'Loading live state' },
  ]);
  const [trajectories, setTrajectories] = useState<FloatTrajectory[]>([]);
  const [anomalies, setAnomalies] = useState<OceanAnomaly[]>([]);
  const [selectedAnomaly, setSelectedAnomaly] = useState<OceanAnomaly | null>(null);
  const [transectVariable, setTransectVariable] = useState<'temperature' | 'salinity'>('temperature');
  const [transect, setTransect] = useState<Transect | null>(null);
  const [transectLoading, setTransectLoading] = useState(true);
  const [drawnTransect, setDrawnTransect] = useState<TransectPoint[]>([]);

  useEffect(() => {
    let active = true;
    const refreshMetrics = async () => {
      try {
        const [healthResponse, anomaliesResponse, floatsResponse, metricsResponse] = await Promise.all([
          fetch('/api/health'),
          fetch('/api/anomalies'),
          fetch('/api/floats'),
          fetch('/api/metrics'),
        ]);
        if (!healthResponse.ok || !anomaliesResponse.ok) throw new Error('Metrics request failed');
        const health = await healthResponse.json();
        const anomalies = await anomaliesResponse.json();
        const floats = floatsResponse.ok ? await floatsResponse.json() : { float_ids: [] };
        const measured = metricsResponse.ok ? await metricsResponse.json() : { percentiles: {} };
        if (!active) return;
        const percentiles = measured.percentiles ?? {};
        const totalP50 = Number(percentiles.total_ms?.p50 ?? 0);
        const layers = [
          ['embedding_ms', 'Embedding', 'cyan'],
          ['faiss_ms', 'FAISS retrieval', 'cyan'],
          ['sql_ms', 'Structured SQL', 'teal'],
          ['graph_ms', 'Graph retrieval', 'teal'],
          ['llm_ms', 'LLM synthesis', 'amber'],
        ] as const;
        setPipeline(
          layers
            .filter(([key]) => Number(percentiles[key]?.p50 ?? 0) > 0)
            .map(([key, step, tone]) => {
              const p50 = Number(percentiles[key]?.p50 ?? 0);
              return {
                step,
                tone,
                value: `${p50.toFixed(1)} ms · p95 ${Number(percentiles[key]?.p95 ?? 0).toFixed(1)} ms`,
                width: `${Math.max(4, Math.min(100, totalP50 ? (p50 / totalP50) * 100 : 4))}%`,
              };
            }),
        );
        setPipelineTotal(totalP50 ? `${totalP50.toFixed(1)} ms` : 'No runs');
        const liveAnomalies = (anomalies.events ?? []) as OceanAnomaly[];
        setAnomalies(liveAnomalies);
        const floatIds = Array.from(new Set((floats.float_ids ?? []).concat(liveAnomalies.map((event) => event.float_id).filter(Boolean)))).slice(0, 8) as string[];
        const trajectoryResponses = await Promise.all(
          floatIds.map(async (floatId) => {
            const response = await fetch(`/api/floats/${encodeURIComponent(floatId)}/trajectory`);
            if (!response.ok) return null;
            return (await response.json()) as FloatTrajectory;
          }),
        );
        if (active) setTrajectories(trajectoryResponses.filter((trajectory): trajectory is FloatTrajectory => Boolean(trajectory?.path?.length)));
        const timestamp = new Date(health.timestamp);
        setMetrics([
          { label: 'Profiles ingested', value: Number(health.profiles ?? 0).toLocaleString(), delta: health.status === 'demo' ? 'Demo data' : 'Live backend' },
          { label: 'Detected anomalies', value: Number(anomalies.count ?? 0).toLocaleString(), delta: anomalies.status === 'demo' ? 'Demo data' : 'Latest scan' },
          { label: 'Backend status', value: health.status === 'ok' ? 'Online' : 'Demo', delta: health.service ?? 'FloatChat backend' },
          { label: 'Last telemetry', value: Number.isNaN(timestamp.getTime()) ? '—' : timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), delta: 'UTC snapshot' },
        ]);
      } catch {
        if (active) setMetrics((current) => current.map((metric) => ({ ...metric, delta: 'Backend offline' })));
      }
    };

    refreshMetrics();
    const interval = window.setInterval(refreshMetrics, 30000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    let active = true;
    setTransectLoading(true);
    fetch(`/api/transect?variable=${transectVariable}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data: Transect | null) => {
        if (active) setTransect(data && Array.isArray(data.grid) ? data : null);
      })
      .catch(() => {
        if (active) setTransect(null);
      })
      .finally(() => {
        if (active) setTransectLoading(false);
      });
    return () => {
      active = false;
    };
  }, [transectVariable]);

  const anomalyPrompt = selectedAnomaly
    ? `Explain the ${selectedAnomaly.variable ?? 'ocean'} anomaly near ${selectedAnomaly.lat.toFixed(2)}°N, ${selectedAnomaly.lon.toFixed(2)}°E at ${selectedAnomaly.depth}m.`
    : undefined;
  const transectValues = transect?.grid.flatMap((row) => row.values.filter((value): value is number => typeof value === 'number')) ?? [];
  const transectMin = transectValues.length ? Math.min(...transectValues) : 0;
  const transectMax = transectValues.length ? Math.max(...transectValues) : 1;

  return (
    <main className="relative min-h-screen overflow-hidden bg-[var(--fc-canvas)] text-[var(--fc-ink)]">
      <div className="absolute inset-0">
        <OceanScene trajectories={trajectories} anomalies={anomalies} onAnomalyClick={setSelectedAnomaly} onTransectDraw={setDrawnTransect} />
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen max-w-[1500px] flex-col px-4 pb-10 pt-5 sm:px-6 lg:px-10">
        <header className="mb-5 flex items-center justify-between gap-4 border-b border-[var(--fc-line)] bg-[var(--fc-canvas)]/80 px-1 py-3 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md border border-[var(--fc-accent)]/50 bg-[var(--fc-accent)]/10 text-xs font-semibold text-[var(--fc-accent-strong)]">F</div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--fc-ink-subtle)]">ARGO / BGC</div>
              <div className="font-semibold text-[var(--fc-ink)]">FloatChat</div>
            </div>
          </div>
          <div className="hidden items-center gap-5 text-xs text-[var(--fc-ink-subtle)] md:flex">
            <span>Telemetry</span>
            <span>Traces</span>
            <span>Transects</span>
            <span>Anomalies</span>
          </div>
          <button className="rounded-md border border-[var(--fc-success)]/40 bg-[var(--fc-success)]/10 px-3 py-2 text-xs font-medium text-[var(--fc-success)] transition hover:bg-[var(--fc-success)]/20">
            Live ingest on
          </button>
        </header>

        <section className="grid flex-1 grid-cols-1 gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="flex min-h-[340px] flex-col justify-between gap-5">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7 }}
              className="panel max-w-[760px] rounded-lg p-6 md:p-8"
            >
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[var(--fc-accent)]/30 bg-[var(--fc-accent)]/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--fc-accent-strong)]">
                Instrument overview
              </div>

              <h1 className="max-w-[620px] text-3xl font-semibold leading-[1.1] tracking-[-0.04em] text-[var(--fc-ink)] md:text-4xl">
                Read the water column in plain language.
              </h1>

              <p className="mt-4 max-w-[560px] text-sm leading-6 text-[var(--fc-ink-muted)] md:text-base">
                Cross-correlate ARGO and BGC-Argo observations across temperature, salinity, oxygen, and chlorophyll with traceable semantic, SQL, LLM, and graph evidence.
              </p>

              <div className="mt-7 flex flex-wrap items-center gap-3">
                <div className="rounded-md border border-[var(--fc-accent)]/25 bg-[var(--fc-accent)]/10 px-4 py-2 text-sm text-[var(--fc-accent-strong)]">"Show me the warmest depth band in the Arabian Sea"</div>
                <div className="mono rounded-md border border-[var(--fc-line)] bg-[var(--fc-surface-inset)] px-3 py-2 text-xs text-[var(--fc-ink-muted)]">Depth 180m · 2024 Q3</div>
              </div>
            </motion.div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {metrics.map((metric, idx) => (
                <motion.div
                  key={metric.label}
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 * idx, duration: 0.5 }}
                  className="panel rounded-md p-4"
                >
                  <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--fc-ink-subtle)]">{metric.label}</div>
                  <div className="mono text-2xl font-semibold tracking-[-0.04em] text-[var(--fc-ink)]">{metric.value}</div>
                  <div className="mt-3 text-xs text-[var(--fc-accent)]">{metric.delta}</div>
                </motion.div>
              ))}
            </div>
          </div>

          <motion.aside
            initial={{ opacity: 0, x: 18 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7, delay: 0.12 }}
            className="relative overflow-hidden rounded-lg"
          >
            <ChatPanel questionSeed={anomalyPrompt} />
            {selectedAnomaly && (
              <button type="button" onClick={() => setSelectedAnomaly(null)} className="mt-2 text-left text-xs text-[var(--fc-warning)] hover:text-[var(--fc-accent-strong)]">
                Anomaly loaded into chat · clear selection
              </button>
            )}
            <div className="panel relative mt-6 overflow-hidden rounded-lg p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--fc-ink-subtle)]">Pipeline trace</div>
                  <div className="mt-1 text-xl font-semibold text-[var(--fc-ink)]">Latency annotated</div>
                </div>
                <div className="mono rounded-full border border-[var(--fc-success)]/30 bg-[var(--fc-success)]/10 px-2.5 py-1.5 text-xs text-[var(--fc-success)]">{pipelineTotal}</div>
              </div>

              <div className="space-y-4">
                {pipeline.map((item) => (
                  <div key={item.step} className="data-line rounded-md border border-[var(--fc-line)] bg-[var(--fc-surface-inset)] p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm text-[var(--fc-ink-muted)]">{item.step}</div>
                      <div className="mono text-xs text-[var(--fc-ink-subtle)]">{item.value}</div>
                    </div>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--fc-surface-3)]">
                      <div
                        className={`h-full rounded-full ${
                          item.tone === 'cyan'
                            ? 'bg-[var(--fc-accent)]'
                            : item.tone === 'teal'
                              ? 'bg-[var(--fc-success)]'
                              : 'bg-[var(--fc-warning)]'
                        }`}
                        style={{ width: item.width }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 rounded-md border border-[var(--fc-warning)]/25 bg-[var(--fc-warning)]/10 p-4">
                <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--fc-warning)]">Detected anomaly</div>
                <div className="mt-2 flex items-end justify-between gap-4">
                  {selectedAnomaly ? (
                    <>
                      <div>
                        <div className="text-lg font-semibold text-[var(--fc-ink)]">{selectedAnomaly.variable ?? 'Ocean'} event</div>
                        <div className="mt-1 text-sm text-[var(--fc-ink-muted)]">{selectedAnomaly.lat.toFixed(2)}°N / {selectedAnomaly.lon.toFixed(2)}°E / {selectedAnomaly.depth}m</div>
                      </div>
                      <div className="mono text-lg text-[var(--fc-warning)]">{(selectedAnomaly.severity ?? 0).toFixed(1)}σ</div>
                    </>
                  ) : (
                    <div className="text-sm text-[var(--fc-ink-muted)]">{anomalies.length ? `${anomalies.length} events in latest scan` : 'No anomaly events in latest scan'}</div>
                  )}
                </div>
              </div>
            </div>
          </motion.aside>
        </section>

        <section className="panel mt-6 rounded-lg p-5 md:p-6">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--fc-ink-subtle)]">Observed transect</div>
              <div className="mt-1 text-xl font-semibold text-[var(--fc-ink)]">Temperature / salinity cross-section</div>
              <div className="mt-1 text-sm text-[var(--fc-ink-subtle)]">
                Real profile measurements · distance along the observed route
                {drawnTransect.length >= 2 && <span className="ml-2 text-[var(--fc-accent)]">· custom route {drawnTransect.length} points</span>}
              </div>
            </div>
            <label className="text-xs text-[var(--fc-ink-muted)]">
              Variable
              <select value={transectVariable} onChange={(event) => setTransectVariable(event.target.value as 'temperature' | 'salinity')} className="focus-ring ml-2 rounded-md border border-[var(--fc-line)] bg-[var(--fc-surface-inset)] px-3 py-2 text-sm text-[var(--fc-accent-strong)] outline-none">
                <option value="temperature">Temperature</option>
                <option value="salinity">Salinity</option>
              </select>
            </label>
          </div>

          {transectLoading ? (
            <div className="data-line rounded-md border border-[var(--fc-line)] bg-[var(--fc-surface-inset)] p-8 text-center text-sm text-[var(--fc-ink-subtle)]">Loading observed section…</div>
          ) : transect?.grid.length ? (
            <div className="overflow-x-auto rounded-md border border-[var(--fc-line)] bg-[var(--fc-surface-inset)] p-3">
              <div className="mb-2 flex justify-between text-[10px] text-[var(--fc-ink-subtle)]"><span>Surface</span><span>{transect.distance_km.at(-1)?.toFixed(1) ?? 0} km transect distance</span><span>Depth ↓</span></div>
              <div className="min-w-[560px]">
                {transect.grid.map((row) => (
                  <div key={row.depth} className="flex h-3 gap-px">
                    {row.values.map((value, index) => {
                      const ratio = value == null ? 0 : (value - transectMin) / Math.max(transectMax - transectMin, 0.001);
                      const palette = transectVariable === 'temperature'
                        ? ['var(--fc-temp-1)', 'var(--fc-temp-2)', 'var(--fc-temp-3)', 'var(--fc-temp-4)', 'var(--fc-temp-5)']
                        : ['var(--fc-sal-1)', 'var(--fc-sal-2)', 'var(--fc-sal-3)', 'var(--fc-sal-4)', 'var(--fc-sal-5)'];
                      const color = value == null ? 'var(--fc-surface-3)' : palette[Math.min(4, Math.floor(Math.max(0, Math.min(1, ratio)) * 5))];
                      return <div key={`${row.depth}-${index}`} title={`${row.depth}m · ${value == null ? 'no observation' : value.toFixed(3)}`} className="flex-1 rounded-[1px]" style={{ backgroundColor: color }} />;
                    })}
                  </div>
                ))}
              </div>
              <div className="mt-2 flex justify-between text-[10px] text-[var(--fc-ink-subtle)]"><span>{transect.depths[0] ?? 0}m</span><span>{transect.depths.at(-1) ?? 0}m</span></div>
            </div>
          ) : (
            <div className="rounded-md border border-[var(--fc-line)] bg-[var(--fc-surface-inset)] p-8 text-center text-sm text-[var(--fc-ink-subtle)]">No observed {transectVariable} measurements are available for a cross-section yet.</div>
          )}
        </section>
      </div>
    </main>
  );
}
