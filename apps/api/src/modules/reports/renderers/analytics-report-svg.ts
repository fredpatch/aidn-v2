/** ANALYTICS-GLOBAL-UX-1 - inline SVG charts for the analytics PDF, built
 *  from the report snapshot (no chart library, no browser script). Values
 *  are raw calendar days; only labels are formatted. Every number written to
 *  the markup goes through `coord`, so NaN / Infinity / undefined never
 *  reach the SVG; every text goes through escapeHtml. Readable in grayscale:
 *  the series differ by line style and marker shape, the SLA bar is hatched,
 *  and values are printed next to the bars. */
import { formatCalendarDuration } from '@aidn/shared';
import { escapeHtml } from '../../../shared/pdf/html-pdf.js';
import type { AnalyticsPhaseStat, AnalyticsTrendPoint } from '../../analytics/analytics.types.js';

const INK = '#0f172a';
const MUTED = '#64748b';
const GRID = '#e2e8f0';
const AVERAGE = '#1d4ed8';
const MEDIAN = '#15803d';
const OVER_TARGET = '#b91c1c';

const isNumber = (value: number | null | undefined): value is number => typeof value === 'number' && Number.isFinite(value);

/** A safe SVG coordinate / length. */
function coord(value: number): string {
  return Number.isFinite(value) ? String(Math.round(value * 10) / 10) : '0';
}

/** Smallest « nice » axis maximum (1, 2 or 5 x 10^k per tick, 4 ticks) above `max`. */
export function niceAxisMax(max: number, ticks = 4): number {
  if (!Number.isFinite(max) || max <= 0) return ticks;
  const rawStep = max / ticks;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const step = [1, 2, 5, 10].map((factor) => factor * magnitude).find((candidate) => candidate >= rawStep) ?? rawStep;
  return step * ticks;
}

function formatAxisDate(isoDate: string): string {
  const [, month, day] = isoDate.split('-');
  return month && day ? `${day}/${month}` : isoDate;
}

/** Line chart of the processing duration (average and median), or null when
 *  no point has a value. */
export function renderTrendSvg(points: readonly AnalyticsTrendPoint[]): string | null {
  const series = [
    { label: 'Délai moyen', color: AVERAGE, dash: '', marker: 'circle' as const, values: points.map((p) => p.averageDurationDays) },
    { label: 'Médiane', color: MEDIAN, dash: '6 4', marker: 'square' as const, values: points.map((p) => p.medianDurationDays) },
  ];
  const finite = series.flatMap((s) => s.values.filter(isNumber));
  if (!points.length || !finite.length) return null;

  const width = 680;
  const height = 250;
  const left = 52;
  const right = 16;
  const top = 34;
  const bottom = 40;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const axisMax = niceAxisMax(Math.max(...finite));
  const x = (index: number) => (points.length === 1 ? left + plotWidth / 2 : left + (index * plotWidth) / (points.length - 1));
  const y = (value: number) => top + plotHeight - (value / axisMax) * plotHeight;

  const grid = [0, 1, 2, 3, 4]
    .map((tick) => {
      const value = (axisMax * tick) / 4;
      const yy = y(value);
      return `<line x1="${coord(left)}" y1="${coord(yy)}" x2="${coord(width - right)}" y2="${coord(yy)}" stroke="${GRID}" stroke-width="1" />
<text x="${coord(left - 6)}" y="${coord(yy + 3)}" font-size="9" text-anchor="end" fill="${MUTED}">${escapeHtml(String(Math.round(value * 10) / 10))}</text>`;
    })
    .join('\n');

  const labelEvery = Math.max(1, Math.ceil(points.length / 8));
  const xLabels = points
    .map((point, index) =>
      index % labelEvery === 0 || index === points.length - 1
        ? `<text x="${coord(x(index))}" y="${coord(height - bottom + 14)}" font-size="9" text-anchor="middle" fill="${MUTED}">${escapeHtml(formatAxisDate(point.date))}</text>`
        : ''
    )
    .join('');

  const lines = series
    .map((s) => {
      let path = '';
      let pen = false;
      s.values.forEach((value, index) => {
        if (!isNumber(value)) {
          pen = false;
          return;
        }
        path += `${pen ? 'L' : 'M'}${coord(x(index))} ${coord(y(value))} `;
        pen = true;
      });
      const markers = s.values
        .map((value, index) => {
          if (!isNumber(value)) return '';
          const cx = x(index);
          const cy = y(value);
          return s.marker === 'circle'
            ? `<circle cx="${coord(cx)}" cy="${coord(cy)}" r="3" fill="${s.color}" />`
            : `<rect x="${coord(cx - 3)}" y="${coord(cy - 3)}" width="6" height="6" fill="#fff" stroke="${s.color}" stroke-width="1.5" />`;
        })
        .join('');
      const dash = s.dash ? ` stroke-dasharray="${s.dash}"` : '';
      return `${path ? `<path d="${path.trim()}" fill="none" stroke="${s.color}" stroke-width="2"${dash} />` : ''}${markers}`;
    })
    .join('\n');

  const legend = series
    .map((s, index) => {
      const lx = left + index * 150;
      const marker =
        s.marker === 'circle'
          ? `<circle cx="${coord(lx + 12)}" cy="12" r="3" fill="${s.color}" />`
          : `<rect x="${coord(lx + 9)}" y="9" width="6" height="6" fill="#fff" stroke="${s.color}" stroke-width="1.5" />`;
      return `<line x1="${coord(lx)}" y1="12" x2="${coord(lx + 24)}" y2="12" stroke="${s.color}" stroke-width="2"${s.dash ? ` stroke-dasharray="${s.dash}"` : ''} />${marker}
<text x="${coord(lx + 30)}" y="15" font-size="10" fill="${INK}">${escapeHtml(s.label)}</text>`;
    })
    .join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" role="img" aria-label="Évolution du délai de traitement, en jours calendaires">
${legend}
<text x="${coord(width - right)}" y="15" font-size="9" text-anchor="end" fill="${MUTED}">Durée en jours calendaires</text>
${grid}
<line x1="${coord(left)}" y1="${coord(top + plotHeight)}" x2="${coord(width - right)}" y2="${coord(top + plotHeight)}" stroke="${MUTED}" stroke-width="1" />
${xLabels}
${lines}
</svg>`;
}

/** Grouped horizontal bars: average closed duration vs SLA target per phase
 *  (null when there is no phase). An average above its target is drawn in a
 *  darker red and flagged in text. */
export function renderPhaseDurationSvg(phases: readonly AnalyticsPhaseStat[]): string | null {
  if (!phases.length) return null;
  const width = 680;
  const labelWidth = 150;
  const valueWidth = 170;
  const top = 30;
  const rowHeight = 46;
  const barHeight = 13;
  const height = top + phases.length * rowHeight + 6;
  const barArea = width - labelWidth - valueWidth;
  const largest = Math.max(...phases.flatMap((phase) => [phase.slaTargetDays, phase.averageClosedDurationDays ?? 0]).filter(isNumber));
  const axisMax = niceAxisMax(largest);
  const length = (days: number) => Math.max(0, (days / axisMax) * barArea);

  const rows = phases
    .map((phase, index) => {
      const rowTop = top + index * rowHeight;
      const average = isNumber(phase.averageClosedDurationDays) ? phase.averageClosedDurationDays : null;
      const target = isNumber(phase.slaTargetDays) ? phase.slaTargetDays : 0;
      const over = average !== null && average > target;
      const averageLength = average === null ? 0 : length(average);
      const targetLength = length(target);
      const averageText =
        average === null ? 'Aucune phase clôturée' : `${formatCalendarDuration(average)} — moyenne${over ? ' (au-dessus de la cible)' : ''}`;
      return `<text x="0" y="${coord(rowTop + 17)}" font-size="10" font-weight="bold" fill="${INK}">${escapeHtml(phase.label)}</text>
<rect x="${coord(labelWidth)}" y="${coord(rowTop + 6)}" width="${coord(averageLength)}" height="${barHeight}" fill="${over ? OVER_TARGET : AVERAGE}" />
<text x="${coord(labelWidth + averageLength + 6)}" y="${coord(rowTop + 16)}" font-size="9" fill="${INK}">${escapeHtml(averageText)}</text>
<rect x="${coord(labelWidth)}" y="${coord(rowTop + 6 + barHeight + 3)}" width="${coord(targetLength)}" height="${barHeight}" fill="url(#sla-hatch)" stroke="${INK}" stroke-width="0.8" />
<text x="${coord(labelWidth + targetLength + 6)}" y="${coord(rowTop + 6 + barHeight + 13)}" font-size="9" fill="${MUTED}">${escapeHtml(`${target} j — cible SLA`)}</text>`;
    })
    .join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" role="img" aria-label="Durée moyenne clôturée et cible SLA par phase">
<defs>
  <pattern id="sla-hatch" patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(45)">
    <rect width="5" height="5" fill="#ffffff" />
    <line x1="0" y1="0" x2="0" y2="5" stroke="${INK}" stroke-width="1.2" />
  </pattern>
</defs>
<rect x="${coord(labelWidth)}" y="4" width="18" height="10" fill="${AVERAGE}" />
<text x="${coord(labelWidth + 24)}" y="13" font-size="10" fill="${INK}">Durée moyenne clôturée</text>
<rect x="${coord(labelWidth + 190)}" y="4" width="18" height="10" fill="url(#sla-hatch)" stroke="${INK}" stroke-width="0.8" />
<text x="${coord(labelWidth + 214)}" y="13" font-size="10" fill="${INK}">Cible SLA (jours calendaires)</text>
${rows}
</svg>`;
}
