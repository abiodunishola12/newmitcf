'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';

const API = 'http://localhost:8080';

const CONDITIONS = ['baseline', 'revision_only', 'fixed_gate', 'full_mitcf'];
const COND_COLORS: Record<string, string> = {
  baseline: '#64748b', revision_only: '#f59e0b',
  fixed_gate: '#3b82f6', full_mitcf: '#22c55e',
};
const COND_LABELS: Record<string, string> = {
  baseline: 'Baseline', revision_only: 'Revision Only',
  fixed_gate: 'Fixed Gate', full_mitcf: 'Full MITCF',
};

const TI_DIMENSIONS = [
  { key: 'ti_hallucination', label: 'Hallucination', color: '#ef4444', desc: '1 - hallucination_rate (higher = fewer hallucinations)' },
  { key: 'ti_bias', label: 'Bias', color: '#8b5cf6', desc: 'N/A for POPE/MME (binary tasks)' },
  { key: 'ti_robustness', label: 'Robustness', color: '#f59e0b', desc: 'Selective accuracy under distribution shift' },
  { key: 'ti_decision', label: 'Decision', color: '#3b82f6', desc: 'Decision reliability: correct-initial rate + correction rate' },
  { key: 'trustworthiness_index', label: 'Overall TI', color: '#22c55e', desc: 'Weighted combination of all four dimensions' },
];

interface Run { run_id: string; created_at: string; }

function TIBar({ value, color }: { value: number | null; color: string }) {
  const pct = value != null ? Math.round(value * 100) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 4, transition: 'width 0.5s' }} />
      </div>
      <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12, color: 'var(--text-primary)', width: 42, textAlign: 'right' }}>
        {value != null ? (value * 100).toFixed(1) + '%' : '--'}
      </span>
    </div>
  );
}

export default function VPTrustworthinessPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [selectedRun, setSelectedRun] = useState('');
  const [condMetrics, setCondMetrics] = useState<Array<Record<string, string>>>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    fetch(`${API}/api/visual-perception/runs`)
      .then(r => r.json())
      .then((data: unknown) => {
        const rows = Array.isArray(data) ? (data as Run[]) : [];
        setRuns(rows);
        if (rows.length > 0) setSelectedRun(rows[0].run_id);
      })
      .catch((e: unknown) => setErr(String(e)));
  }, []);

  useEffect(() => {
    if (!selectedRun) return;
    setLoading(true);
    setCondMetrics([]);
    fetch(`${API}/api/visual-perception/runs/${selectedRun}/condition-metrics`)
      .then(r => r.json())
      .then((data: unknown) => setCondMetrics(Array.isArray(data) ? (data as Array<Record<string, string>>) : []))
      .catch((e: unknown) => setErr(String(e)))
      .finally(() => setLoading(false));
  }, [selectedRun]);

  const byCondition: Record<string, Record<string, string>> = {};
  condMetrics.forEach(row => { if (row.condition) byCondition[row.condition] = row; });

  function numVal(row: Record<string, string> | undefined, key: string): number | null {
    if (!row) return null;
    const v = row[key];
    if (!v) return null;
    const n = parseFloat(v);
    return isNaN(n) ? null : n;
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>VP Trustworthiness Index</h2>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
          Visual TI adapted from the MITCF trustworthiness scoring module. Four dimensions: hallucination,
          bias (N/A for POPE/MME), robustness, and decision reliability.
        </p>
      </div>

      {err && (
        <div className="text-xs mb-4 p-2 rounded" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
          {err}
        </div>
      )}

      {runs.length > 0 && (
        <div className="kpi-card mb-4">
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Run:</span>
            {runs.map(r => (
              <button
                key={r.run_id}
                onClick={() => setSelectedRun(r.run_id)}
                className="text-xs px-3 py-1 rounded font-mono"
                style={{
                  background: selectedRun === r.run_id ? 'var(--accent)' : 'rgba(0,0,0,0.3)',
                  color: selectedRun === r.run_id ? 'white' : 'var(--text-secondary)',
                  border: '1px solid var(--border)',
                }}
              >
                {r.run_id}
              </button>
            ))}
          </div>
        </div>
      )}

      {runs.length === 0 && !err && (
        <div className="kpi-card text-center py-8">
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No VP runs found.</p>
          <Link href="/visual-perception/run" style={{ color: 'var(--accent)' }} className="text-sm mt-2 block">
            Launch evaluation
          </Link>
        </div>
      )}

      {loading && (
        <div className="text-xs mt-4" style={{ color: 'var(--text-muted)' }}>Loading TI metrics...</div>
      )}

      {/* Overall TI headline */}
      {!loading && Object.keys(byCondition).length > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            {CONDITIONS.map(c => {
              const ti = numVal(byCondition[c], 'trustworthiness_index');
              return (
                <div key={c} className="kpi-card text-center" style={{ borderTop: `2px solid ${COND_COLORS[c]}` }}>
                  <div className="text-xs font-bold" style={{ color: COND_COLORS[c] }}>{COND_LABELS[c]}</div>
                  <div
                    className="text-3xl font-bold mt-1"
                    style={{ color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}
                  >
                    {ti != null ? (ti * 100).toFixed(1) : '--'}
                  </div>
                  <div className="text-xs" style={{ color: 'var(--text-muted)' }}>TI score</div>
                </div>
              );
            })}
          </div>

          {/* Dimension breakdown bars */}
          <div className="space-y-4">
            {CONDITIONS.map(c => (
              <div key={c} className="kpi-card" style={{ borderLeft: `3px solid ${COND_COLORS[c]}` }}>
                <h3 className="text-sm font-semibold mb-4" style={{ color: COND_COLORS[c] }}>{COND_LABELS[c]}</h3>
                <div className="space-y-3">
                  {TI_DIMENSIONS.map(dim => (
                    <div key={dim.key}>
                      <div className="flex justify-between text-xs mb-1">
                        <span style={{ color: 'var(--text-secondary)' }}>{dim.label}</span>
                        <span className="text-xs" style={{ color: 'var(--text-muted)', maxWidth: 240, textAlign: 'right' }}>
                          {dim.desc}
                        </span>
                      </div>
                      <TIBar value={numVal(byCondition[c], dim.key)} color={dim.color} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Formula */}
      <div className="kpi-card mt-6" style={{ borderLeft: '3px solid #22c55e' }}>
        <h4 className="text-xs font-semibold mb-2" style={{ color: '#22c55e' }}>TI Formula (visual adaptation)</h4>
        <pre
          className="text-xs overflow-x-auto"
          style={{ color: '#93c5fd', background: 'rgba(0,0,0,0.3)', padding: '10px 12px', borderRadius: 6, margin: 0 }}
        >
{`TI = w_h x (1 - hallucination_rate)
   + w_b x ti_bias        (1.0 when bias not applicable)
   + w_r x selective_acc  (accuracy on non-abstained items)
   + w_d x decision_reliability
Default weights: 0.25 each`}
        </pre>
      </div>
    </div>
  );
}
