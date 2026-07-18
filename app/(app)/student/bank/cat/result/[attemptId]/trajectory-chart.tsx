'use client';

// mynclex/app/(app)/student/bank/cat/result/[attemptId]/trajectory-chart.tsx
//
// The trajectory graph (§13.3) — "the most important visual on the page."
//
// X = question number, Y = the ability estimate after that answer, with a
// reference line at zero (the passing standard). The shape is the message:
// settling above the line, settling below it, or never settling at all —
// the last of which is what a near-boundary verdict looks like.
//
// THE SHADED BAND is the 95% confidence interval (theta ± 1.96·SE), the SAME
// interval the stopping rule tests (§9.1). Drawing it is what makes the
// ceiling case legible: a student who ran to 150 questions can SEE the band
// still straddling zero, which is precisely why the exam never stopped early.
// It uses CONFIDENCE_Z from the engine so the picture cannot drift from the
// rule it depicts.
//
// The band is wide at the start on purpose — after one question we genuinely
// know almost nothing, and a chart that hid that would flatter the estimate.

import { CONFIDENCE_Z } from '@/lib/cat';
import type { TrajectoryPoint } from '@/lib/practice/cat/report-derive';

const VIEW_W = 340;
const VIEW_H = 150;
const PAD_L = 6;
/**
 * Wide enough to park the "passing standard" label OUTSIDE the plot. Sitting
 * it inside collided with the trace at 375px — and there is no safe side to
 * move it to, since a passing student's line runs above zero and a failing
 * student's runs below.
 */
const PAD_R = 54;
const PAD_T = 8;
const PAD_B = 16;

/**
 * The y-axis never shrinks below this, so a tight, confident trace doesn't
 * get magnified into a dramatic-looking mountain range by autoscaling.
 */
const MIN_DOMAIN = 1.4;
/** Nor does it stretch past this — the band is huge early on. */
const MAX_DOMAIN = 2.6;

interface Props {
  points: TrajectoryPoint[];
  /** Index of the question currently focused by the chip grid, if any. */
  focusIndex: number | null;
  /** Tone of the verdict, so the trace matches the hero. */
  tone: 'pass' | 'fail' | 'caution';
}

const TONE_STROKE: Record<Props['tone'], string> = {
  pass: '#16a34a',
  fail: '#dc2626',
  caution: '#d97706',
};

export function TrajectoryChart({ points, focusIndex, tone }: Props) {
  if (points.length === 0) return null;

  const stroke = TONE_STROKE[tone];
  const n = points.length;

  // Domain covers the trace and as much of the band as fits the clamp.
  const spread = Math.max(
    MIN_DOMAIN,
    ...points.map((p) => Math.abs(p.theta) + CONFIDENCE_Z * p.se * 0.45),
  );
  const domain = Math.min(spread, MAX_DOMAIN);

  const x = (i: number) => PAD_L + (n > 1 ? i / (n - 1) : 0.5) * (VIEW_W - PAD_L - PAD_R);
  const y = (t: number) => {
    const clamped = Math.max(-domain, Math.min(domain, t));
    return PAD_T + ((domain - clamped) / (2 * domain)) * (VIEW_H - PAD_T - PAD_B);
  };

  const upper = points.map((p, i) => `${x(i)},${y(p.theta + CONFIDENCE_Z * p.se)}`);
  const lower = points.map((p, i) => `${x(i)},${y(p.theta - CONFIDENCE_Z * p.se)}`).reverse();
  const line = points.map((p, i) => `${x(i)},${y(p.theta)}`).join(' ');

  const zeroY = y(0);
  const focused = focusIndex !== null && focusIndex >= 0 && focusIndex < n ? focusIndex : null;

  // Dots would be mud at 150 points, so they thin out as the exam lengthens.
  // The final point and the focused point always draw.
  const dotEvery = n > 100 ? 5 : n > 50 ? 3 : 1;

  return (
    <svg
      className="catr-chart"
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={
        `Ability trajectory across ${n} questions, ending at ` +
        `${points[n - 1].theta >= 0 ? 'above' : 'below'} the passing standard.`
      }
    >
      {/* 95% confidence band — the interval the stopping rule tests. */}
      <polygon points={upper.concat(lower).join(' ')} fill={stroke} opacity={0.12} />

      {/* The passing standard. */}
      <line
        x1={PAD_L}
        y1={zeroY}
        x2={VIEW_W - PAD_R}
        y2={zeroY}
        stroke="#1e3a5f"
        strokeWidth={1}
        strokeDasharray="4 4"
        opacity={0.55}
      />
      <text
        x={VIEW_W - PAD_R + 4}
        y={zeroY}
        dominantBaseline="middle"
        fontSize={7.5}
        fill="#1e3a5f"
        opacity={0.75}
      >
        passing
        <tspan x={VIEW_W - PAD_R + 4} dy="8">standard</tspan>
      </text>

      <polyline
        points={line}
        fill="none"
        stroke={stroke}
        strokeWidth={2.2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {points.map((p, i) => {
        const isLast = i === n - 1;
        const isFocused = focused === i;
        if (!isLast && !isFocused && i % dotEvery !== 0) return null;

        const fill = p.isCorrect ? '#2f9e58' : p.isPartial ? '#e0912f' : '#d5544f';
        const r = isFocused ? 5 : isLast ? 3.6 : 2.2;

        return p.isCaseChild ? (
          <rect
            key={p.position}
            x={x(i) - r}
            y={y(p.theta) - r}
            width={r * 2}
            height={r * 2}
            fill={fill}
            stroke="#fff"
            strokeWidth={isFocused ? 1.6 : 0.8}
            transform={`rotate(45 ${x(i)} ${y(p.theta)})`}
          />
        ) : (
          <circle
            key={p.position}
            cx={x(i)}
            cy={y(p.theta)}
            r={r}
            fill={fill}
            stroke="#fff"
            strokeWidth={isFocused ? 1.6 : 0.8}
          />
        );
      })}

      {/* The focus marker's drop-line — answers "where was I when this
          question was served?" (§13.3) without needing a tooltip. */}
      {focused !== null && (
        <line
          x1={x(focused)}
          y1={PAD_T}
          x2={x(focused)}
          y2={VIEW_H - PAD_B}
          stroke="#1e3a5f"
          strokeWidth={1}
          opacity={0.35}
        />
      )}

      <text x={PAD_L} y={VIEW_H - 4} fontSize={8.5} fill="#9ca3af">
        Q1
      </text>
      <text x={VIEW_W - PAD_R} y={VIEW_H - 4} textAnchor="middle" fontSize={8.5} fill="#9ca3af">
        Q{points[n - 1].position}
      </text>
    </svg>
  );
}
