'use client';
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';

const Plot = dynamic(() => import('react-plotly.js'), { ssr: false });
const API = 'http://localhost:8080';

interface StatRow {
  metric: string; baseline_condition: string; target_condition: string; n_pairs: string;
  baseline_mean: string; target_mean: string; mean_difference_target_minus_baseline: string;
  std_difference: string; ci95_low: string; ci95_high: string;
  mcnemar_chi2: string; p_value: string; improved_pairs: string; worsened_pairs: string;
  effect_odds_ratio_improved_to_worsened: string; higher_is_better: string; holm_adjusted_p_value: string;
}
interface Run { run_id: string; }

function sig(p: number): string {
  if (p < 0.01) return '**';
  if (p < 0.05) return '*';
  return 'ns';
}
function sigColor(p: number): string {
  if (p < 0.01) return '#22c55e';
  if (p < 0.05) return '#f59e0b';
  return '#64748b';
}

export default function StatisticalAnalysisPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [selectedRun, setSelectedRun] = useState('');
  const [stats, setStats] = useState<StatRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/api/experiments`).then(r => r.json()).then((r: Run[]) => {
      setRuns(r);
      if (r.length) { setSelectedRun(r[r.length - 1].run_id); }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedRun) return;
    fetch(`${API}/api/experiments/${selectedRun}/statistical-tests`).then(r => r.json()).then(setStats).catch(() => {});
  }, [selectedRun]);

  const forestData = stats.map(s => ({
    metric: s.metric,
    mean: parseFloat(s.mean_difference_target_minus_baseline),
    lo: parseFloat(s.ci95_low),
    hi: parseFloat(s.ci95_high),
    p: parseFloat(s.holm_adjusted_p_value),
    higherGood: s.higher_is_better === 'True',
  }));

  if (loading) return <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading statistical tests...</div>;

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Statistical Analysis</h2>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
          McNemar test + Bootstrap 95% CI + Holm–Bonferroni correction for baseline vs. full_mitcf
        </p>
      </div>

      {/* Run selector */}
      <div className="flex items-center gap-3 mb-4">
        <label className="text-xs" style={{ color: 'var(--text-muted)' }}>Experiment run:</label>
        <select value={selectedRun} onChange={e => setSelectedRun(e.target.value)}
          className="text-xs px-2 py-1 rounded" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
          {runs.map(r => <option key={r.run_id} value={r.run_id}>{r.run_id}</option>)}
        </select>
      </div>

      {stats.length > 0 && (
        <>
          {/* Forest plot */}
          <div className="kpi-card mb-6">
            <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
              Forest Plot — Mean Difference (target − baseline) with 95% CI
            </h3>
            <Plot
              data={forestData.map((d, i) => ({
                type: 'scatter' as const, mode: 'markers+lines' as const, showlegend: false,
                x: [d.lo, d.mean, d.hi], y: [d.metric, d.metric, d.metric],
                marker: { color: [sigColor(d.p), sigColor(d.p), sigColor(d.p)], size: [4, 12, 4], symbol: ['line-ew', 'diamond', 'line-ew'] },
                line: { color: sigColor(d.p), width: 2 },
              }))}
              layout={{
                paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
                margin: { t: 10, l: 160, r: 60, b: 40 }, height: Math.max(180, forestData.length * 50),
                xaxis: { color: '#94a3b8', zeroline: true, zerolinecolor: '#475569', zerolinewidth: 1.5, title: { text: 'Mean Difference', font: { color: '#94a3b8', size: 11 } } },
                yaxis: { color: '#94a3b8', automargin: true },
                shapes: [{ type: 'line', x0: 0, x1: 0, y0: -0.5, y1: forestData.length - 0.5, line: { color: '#475569', dash: 'dash', width: 1 } }],
              }}
              config={{ displayModeBar: false }} style={{ width: '100%' }} />
            <div className="flex gap-4 mt-2">
              {[['** p<0.01','#22c55e'],['* p<0.05','#f59e0b'],['ns not significant','#64748b']].map(([l,c]) => (
                <span key={l} className="text-xs flex items-center gap-1">
                  <span className="w-3 h-3 rounded-full inline-block" style={{ background: c }} />
                  <span style={{ color: 'var(--text-muted)' }}>{l}</span>
                </span>
              ))}
            </div>
          </div>

          {/* Full table */}
          <div className="kpi-card overflow-x-auto">
            <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Paired Test Results (baseline vs. full_mitcf)</h3>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Metric</th>
                  <th>Baseline Mean</th>
                  <th>Target Mean</th>
                  <th>Mean Diff</th>
                  <th>95% CI Low</th>
                  <th>95% CI High</th>
                  <th>McNemar χ²</th>
                  <th>p-value</th>
                  <th>Holm p</th>
                  <th>Sig</th>
                  <th>Effect OR</th>
                  <th>↑ Good</th>
                </tr>
              </thead>
              <tbody>
                {stats.map(s => {
                  const p = parseFloat(s.holm_adjusted_p_value);
                  const rawP = parseFloat(s.p_value);
                  const diff = parseFloat(s.mean_difference_target_minus_baseline);
                  const higherGood = s.higher_is_better === 'True';
                  const improved = (higherGood && diff > 0) || (!higherGood && diff < 0);
                  return (
                    <tr key={s.metric}>
                      <td className="font-mono text-xs">{s.metric}</td>
                      <td>{parseFloat(s.baseline_mean).toFixed(4)}</td>
                      <td>{parseFloat(s.target_mean).toFixed(4)}</td>
                      <td style={{ color: improved ? '#22c55e' : '#ef4444', fontWeight: 600 }}>
                        {diff > 0 ? '+' : ''}{diff.toFixed(4)}
                      </td>
                      <td className="font-mono text-xs">{parseFloat(s.ci95_low).toFixed(4)}</td>
                      <td className="font-mono text-xs">{parseFloat(s.ci95_high).toFixed(4)}</td>
                      <td className="font-mono text-xs">{parseFloat(s.mcnemar_chi2).toFixed(4)}</td>
                      <td className="font-mono text-xs">{rawP.toFixed(4)}</td>
                      <td className="font-mono text-xs">{p.toFixed(4)}</td>
                      <td><span style={{ color: sigColor(p), fontWeight: 700 }}>{sig(p)}</span></td>
                      <td className="font-mono text-xs">{parseFloat(s.effect_odds_ratio_improved_to_worsened).toFixed(2)}</td>
                      <td style={{ color: 'var(--text-muted)' }}>{s.higher_is_better}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="text-xs mt-3" style={{ color: 'var(--text-muted)' }}>
              * p &lt; 0.05, ** p &lt; 0.01 (Holm–Bonferroni adjusted). McNemar test with continuity correction. Bootstrap 95% CI from paired differences.
            </p>
          </div>
        </>
      )}

      {stats.length === 0 && !loading && (
        <div className="kpi-card">
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No statistical test data found for this run.</p>
        </div>
      )}
    </div>
  );
}
