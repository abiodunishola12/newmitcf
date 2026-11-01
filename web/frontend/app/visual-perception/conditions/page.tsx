'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';

const API = 'http://localhost:8080';

const CONDITIONS = ['baseline', 'revision_only', 'fixed_gate', 'full_mitcf'];
const COND_LABELS: Record<string, string> = {
  baseline: 'Baseline', revision_only: 'Revision Only',
  fixed_gate: 'Fixed Gate', full_mitcf: 'Full MITCF',
};
const COND_COLORS: Record<string, string> = {
  baseline: '#64748b', revision_only: '#f59e0b',
  fixed_gate: '#3b82f6', full_mitcf: '#22c55e',
};
const METRICS = ['accuracy', 'f1', 'precision', 'recall', 'abstention_rate', 'hallucination_rate', 'trustworthiness_index', 'latency_mean'];
const METRIC_LABELS: Record<string, string> = {
  accuracy: 'Accuracy', f1: 'F1', precision: 'Precision', recall: 'Recall',
  abstention_rate: 'Abstention Rate', hallucination_rate: 'Hallucination Rate',
  trustworthiness_index: 'Trustworthiness Index', latency_mean: 'Mean Latency (s)',
};

interface Run { run_id: string; created_at: string; }

export default function VPConditionsPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [selectedRun, setSelectedRun] = useState('');
  const [metrics, setMetrics] = useState<Record<string, Record<string, string>>>({});
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    fetch(`${API}/api/visual-perception/runs`).then(r => r.json())
      .then((data: Run[]) => {
        setRuns(data);
        if (data.length > 0) setSelectedRun(data[0].run_id);
      }).catch(e => setErr(String(e)));
  }, []);

  useEffect(() => {
    if (!selectedRun) return;
    setLoading(true); setMetrics({});
    fetch(`${API}/api/visual-perception/runs/${selectedRun}/condition-metrics`)
      .then(r => r.json())
      .then((rows: Array<Record<string, string>>) => {
        const m: Record<string, Record<string, string>> = {};
        rows.forEach(row => { if (row.condition) m[row.condition] = row; });
        setMetrics(m);
      }).catch(e => setErr(String(e)))
      .finally(() => setLoading(false));
  }, [selectedRun]);

  function fmtMetric(val: string | undefined, key: string): string {
    if (!val || val === '') return 'â€”';
    const n = parseFloat(val);
    if (isNaN(n)) return val;
    if (key === 'latency_mean') return n.toFixed(2) + 's';
    if (key.includes('rate') || key === 'accuracy' || key === 'f1' || key === 'precision' || key === 'recall')
      return (n * 100).toFixed(1) + '%';
    return n.toFixed(3);
  }

  const baseline = metrics['baseline'];
  function delta(val: string | undefined, baseVal: string | undefined, key: string): string {
    if (!val || !baseVal) return '';
    const n = parseFloat(val), b = parseFloat(baseVal);
    if (isNaN(n) || isNaN(b) || b === 0) return '';
    const pct = ((n - b) / Math.abs(b)) * 100;
    const sign = pct >= 0 ? '+' : '';
    return sign + pct.toFixed(1) + '%';
  }
  function deltaColor(d: string): string {
    if (!d) return 'transparent';
    const n = parseFloat(d);
    return n > 0 ? '#22c55e' : n < 0 ? '#ef4444' : 'var(--text-muted)';
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Condition Comparison</h2>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
          Side-by-side metrics for all four experimental conditions. Î” is relative to Baseline.
        </p>
      </div>

      {err && <div className="text-xs mb-4 p-2 rounded" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>{err}</div>}

      {/* Run selector */}
      {runs.length > 0 && (
        <div className="kpi-card mb-6">
          <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Select Run</h3>
          <div className="flex flex-wrap gap-2">
            {runs.map(r => (
              <button key={r.run_id} onClick={() => setSelectedRun(r.run_id)}
                className="text-xs px-3 py-1.5 rounded font-mono"
                style={{
                  background: selectedRun === r.run_id ? 'var(--accent)' : 'rgba(0,0,0,0.3)',
                  color: selectedRun === r.run_id ? 'white' : 'var(--text-secondary)',
                  border: '1px solid var(--border)',
                }}>
                {r.run_id}
              </button>
            ))}
          </div>
        </div>
      )}

      {runs.length === 0 && !err && (
        <div className="kpi-card text-center py-8">
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No VP runs found.</p>
          <Link href="/visual-perception/run" className="text-sm mt-2 block" style={{ color: 'var(--accent)' }}>Launch an evaluation â†’</Link>
        </div>
      )}

      {loading && <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Loading metricsâ€¦</div>}

      {!loading && Object.keys(metrics).length > 0 && (
        <>
          {/* Condition headers */}
          <div className="grid grid-cols-4 gap-3 mb-4">
            {CONDITIONS.map(c => (
              <div key={c} className="kpi-card text-center" style={{ borderTop: `2px solid ${COND_COLORS[c]}` }}>
                <div className="text-xs font-bold" style={{ color: COND_COLORS[c] }}>{COND_LABELS[c]}</div>
                <div className="text-2xl font-bold mt-1" style={{ color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                  {metrics[c] ? fmtMetric(metrics[c].accuracy, 'accuracy') : 'â€”'}
                </div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>accuracy</div>
              </div>
            ))}
          </div>

          {/* Full metric table */}
          <div className="kpi-card overflow-x-auto">
            <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>All Metrics</h3>
            <table className="w-full text-xs" style={{ borderCollapse: 'collapse', minWidth: 600 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                  <th className="text-left py-2 pr-4">Metric</th>
                  {CONDITIONS.map(c => (
                    <th key={c} className="text-right py-2 pr-4" style={{ color: COND_COLORS[c] }}>
                      {COND_LABELS[c]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {METRICS.map(m => (
                  <tr key={m} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td className="py-2 pr-4" style={{ color: 'var(--text-secondary)' }}>{METRIC_LABELS[m] ?? m}</td>
                    {CONDITIONS.map(c => {
                      const val = metrics[c]?.[m];
                      const d = c !== 'baseline' ? delta(val, baseline?.[m], m) : '';
                      return (
                        <td key={c} className="py-2 pr-4 text-right font-mono" style={{ color: 'var(--text-primary)' }}>
                          {fmtMetric(val, m)}
                          {d && (
                            <span className="ml-1 text-xs" style={{ color: deltaColor(d) }}>({d})</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
