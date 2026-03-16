import type { ProfilerExport } from '../schemas/messages.js';

export interface ParsedProfilerExport {
  config: {
    mode?: string;
    includeServerBreakdown?: boolean;
  };
  aggregates: Record<string, { count: number; min: number; max: number; avg: number; sum: number }>;
  recentEvents: Array<{
    op?: string;
    kind?: string;
    phase?: string;
    ms?: number;
    tags?: Record<string, string>;
    gauges?: Record<string, number>;
  }>;
}

export function parseProfilerExport(data: ProfilerExport): ParsedProfilerExport | null {
  const raw = data as Record<string, unknown>;
  const config = raw['config'];
  const aggregates = raw['aggregates'];

  if (typeof config !== 'object' || config === null) return null;
  if (typeof aggregates !== 'object' || aggregates === null) return null;

  const parsedAggregates: ParsedProfilerExport['aggregates'] = {};
  for (const [key, val] of Object.entries(aggregates as Record<string, unknown>)) {
    const s = val as Record<string, unknown> | undefined;
    if (typeof s?.['count'] !== 'number') continue;
    parsedAggregates[key] = {
      count: s['count'] as number,
      min: typeof s['min'] === 'number' ? s['min'] : 0,
      max: typeof s['max'] === 'number' ? s['max'] : 0,
      avg: typeof s['avg'] === 'number' ? s['avg'] : 0,
      sum: typeof s['sum'] === 'number' ? s['sum'] : 0,
    };
  }

  const rawEvents = raw['recentEvents'];
  const recentEvents: ParsedProfilerExport['recentEvents'] = Array.isArray(rawEvents)
    ? rawEvents.map((e) => e as ParsedProfilerExport['recentEvents'][number])
    : [];

  return {
    config: config as ParsedProfilerExport['config'],
    aggregates: parsedAggregates,
    recentEvents,
  };
}

export function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function renderRawProfilerFallback(consumerId: string, data: ProfilerExport): string {
  const shortId = consumerId.split('-').slice(1, 3).join('-');
  return `
  <div class="consumer-section">
    <div class="consumer-header">
      <h3>📊 ${shortId}</h3>
      <div class="consumer-stats"><span style="color: #f59e0b;">Unknown profiler format</span></div>
    </div>
    <details>
      <summary style="cursor: pointer; color: #6b7280;">View raw JSON</summary>
      <pre style="background: #f3f4f6; padding: 10px; border-radius: 4px; overflow-x: auto; font-size: 12px;">${escapeHtml(JSON.stringify(data, null, 2))}</pre>
    </details>
  </div>`;
}
