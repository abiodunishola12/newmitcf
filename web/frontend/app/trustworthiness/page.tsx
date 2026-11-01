'use client';
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';

const Plot = dynamic(() => import('react-plotly.js'), { ssr: false });
const API = 'http://localhost:8080';

interface CondRow {
  condition: string; accuracy: string; trustworthiness_index: string;
  ti_hallucination: string; ti_bias: string; ti_robustness: string; ti_decision: string;
  hallucination_rate: string; bias_rate: string; robustness_score: string; decision_reliability: string;
  attack_success_rate: string; unsafe_prevention_rate: string;
}

const CONDITIONS = ['baseline','mitcf_1_verification','mitcf_2_verification_critique','mitcf_3_verification_critique_revision','full_mitcf'];
const COND_LABELS = ['Baseline','MITCF-1\n(Verify)','MITCF-2\n(+Critique)','MITCF-3\n(+Revise)','Full MITCF'];
const COLORS = ['#ef4444','#f59e0b','#3b82f6','#6366f1','#22c55e'];

export default function TrustworthinessPage() {
  const [runs, setRuns] = useState<{run_id:string}[]>([]);
  const [selectedRun, setSelectedRun] = useState('');
  const [rows, setRows] = useState<CondRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/api/experiments`).then(r => r.json()).then((r: {run_id:string}[]) => {
      setRuns(r);
      if (r.length) setSelectedRun(r[r.length-1].run_id);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedRun) return;
    fetch(`${API}/api/experiments/${selectedRun}/condition-metrics`).then(r => r.json()).then(setRows).catch(() => {});
  }, [selectedRun]);

  const ordered = CONDITIONS.map(c => rows.find(r => r.condition === c)).filter(Boolean) as CondRow[];

  const tiValues = ordered.map(r => parseFloat(r.trustworthiness_index));
  const tiComponents = [
    { key: 'ti_hallucination' as const, label: 'TI Hallucination', color: '#ef4444' },
    { key: 'ti_bias' as const, label: 'TI Bias', color: '#f59e0b' },
    { key: 'ti_robustness' as const, label: 'TI Robustness', color: '#3b82f6' },
    { key: 'ti_decision' as const, label: 'TI Decision', color: '#a855f7' },
  ];

  const plotLayout = (yTitle: string, yRange?: [number,number]) => ({
    paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
    margin: { t: 10, l: 55, r: 10, b: 80 }, height: 280,
    xaxis: { color: '#94a3b8', tickangle: -30, tickfont: { size: 10 } },
    yaxis: { color: '#94a3b8', ...(yRange ? {range: yRange} : {}), title: { text: yTitle, font: { color: '#94a3b8', size: 11 } } },
    legend: { font: { color: '#94a3b8', size: 10 }, bgcolor: 'transparent' },
  });

  if (loading) return <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading trustworthiness data...</div>;

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Trustworthiness Index</h2>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
          TI = 0.25 × (1−hallucination_rate) + 0.25 × (1−bias_rate) + 0.25 × robustness_score + 0.25 × decision_reliability
        </p>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <label className="text-xs" style={{ color: 'var(--text-muted)' }}>Run:</label>
        <select value={selectedRun} onChange={e => setSelectedRun(e.target.value)}
          className="text-xs px-2 py-1 rounded" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
          {runs.map(r => <option key={r.run_id} value={r.run_id}>{r.run_id}</option>)}
        </select>
      </div>

      {/* TI KPI cards */}
      {ordered.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
          {ordered.map((r, i) => (
            <div key={r.condition} className="kpi-card text-center p-3" style={{ borderTop: `2px solid ${COLORS[i]}` }}>
              <div className="text-xs mb-1" style={{ color: 'var(--text-muted)', fontSize: '10px' }}>{COND_LABELS[i].replace('\n',' ')}</div>
              <div className="text-2xl font-bold" style={{ color: COLORS[i] }}>{parseFloat(r.trustworthiness_index).toFixed(3)}</div>
              <div className="text-xs mt-1" style={{ color: 'var(--text-muted)', fontSize:'10px' }}>TI</div>
            </div>
          ))}
        </div>
      )}

      {/* TI composite line */}
      {ordered.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <div className="kpi-card">
            <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Composite TI — Ablation Progression</h3>
            <Plot
              data={[{
                type: 'scatter', mode: 'lines+markers',
                x: COND_LABELS.map(l => l.replace('\n',' ')), y: tiValues,
                line: { color: '#22c55e', width: 2 },
                marker: { color: COLORS, size: 10 },
                fill: 'tozeroy', fillcolor: 'rgba(34,197,94,0.1)',
              }]}
              layout={plotLayout('Trustworthiness Index', [0, 1.1])}
              config={{ displayModeBar: false }} style={{ width: '100%' }} />
          </div>

          {/* TI component stacked bar */}
          <div className="kpi-card">
            <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>TI Components — Grouped Bar</h3>
            <Plot
              data={tiComponents.map(c => ({
                type: 'bar' as const, name: c.label,
                x: COND_LABELS.map(l => l.replace('\n',' ')),
                y: ordered.map(r => parseFloat(r[c.key])),
                marker: { color: c.color },
              }))}
              layout={{ ...plotLayout('Component TI'), barmode: 'group' as const }}
              config={{ displayModeBar: false }} style={{ width: '100%' }} />
          </div>
        </div>
      )}

      {/* Condition metrics table */}
      {ordered.length > 0 && (
        <div className="kpi-card overflow-x-auto mb-6">
          <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Full Condition Metrics</h3>
          <table className="data-table">
            <thead>
              <tr>
                <th>Condition</th>
                <th>TI</th>
                <th>Accuracy</th>
                <th>Hallucinat. Rate</th>
                <th>Bias Rate</th>
                <th>Robustness</th>
                <th>Decision Rel.</th>
                <th>Attack Succ.</th>
                <th>Unsafe Prev.</th>
              </tr>
            </thead>
            <tbody>
              {ordered.map((r, i) => (
                <tr key={r.condition}>
                  <td><span className="font-semibold text-xs" style={{ color: COLORS[i] }}>{r.condition}</span></td>
                  <td style={{ color: parseFloat(r.trustworthiness_index) >= 0.8 ? '#22c55e' : '#f59e0b', fontWeight: 600 }}>
                    {parseFloat(r.trustworthiness_index).toFixed(3)}
                  </td>
                  <td>{(parseFloat(r.accuracy)*100).toFixed(1)}%</td>
                  <td style={{ color: parseFloat(r.hallucination_rate) < 0.1 ? '#22c55e' : '#ef4444' }}>
                    {(parseFloat(r.hallucination_rate)*100).toFixed(1)}%
                  </td>
                  <td style={{ color: parseFloat(r.bias_rate) < 0.1 ? '#22c55e' : '#ef4444' }}>
                    {(parseFloat(r.bias_rate)*100).toFixed(1)}%
                  </td>
                  <td style={{ color: parseFloat(r.robustness_score) >= 0.8 ? '#22c55e' : '#f59e0b' }}>
                    {parseFloat(r.robustness_score).toFixed(3)}
                  </td>
                  <td>{parseFloat(r.decision_reliability).toFixed(3)}</td>
                  <td style={{ color: parseFloat(r.attack_success_rate) < 0.1 ? '#22c55e' : '#ef4444' }}>
                    {(parseFloat(r.attack_success_rate)*100).toFixed(1)}%
                  </td>
                  <td style={{ color: parseFloat(r.unsafe_prevention_rate) >= 0.8 ? '#22c55e' : '#f59e0b' }}>
                    {(parseFloat(r.unsafe_prevention_rate)*100).toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* TI formula card */}
      <div className="kpi-card" style={{ borderLeft: '3px solid #3b82f6' }}>
        <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>TI Formula</h3>
        <p className="font-mono text-xs p-3 rounded" style={{ background: 'rgba(0,0,0,0.3)', color: '#93c5fd' }}>
          TI = w₁ × (1 − hallucination_rate)<br />
             + w₂ × (1 − bias_rate)<br />
             + w₃ × robustness_score<br />
             + w₄ × decision_reliability<br /><br />
          where w₁=w₂=w₃=w₄=0.25 (equal weights, configurable)
        </p>
        <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
          Source: <code>mitcf_pipeline/evaluation.py</code> — <code>trustworthiness_scores()</code>
        </p>
      </div>
    </div>
  );
}
