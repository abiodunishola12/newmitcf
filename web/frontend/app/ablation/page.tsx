'use client';
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';

const Plot = dynamic(() => import('react-plotly.js'), { ssr: false });
const API = 'http://localhost:8080';

interface CondRow {
  condition: string; accuracy: string; trustworthiness_index: string;
  hallucination_rate: string; bias_rate: string; robustness_score: string;
  decision_reliability: string; attack_success_rate: string; unsafe_prevention_rate: string;
  avg_model_calls: string; avg_revisions: string; avg_latency_s: string;
}

const CONDITIONS = ['baseline','mitcf_1_verification','mitcf_2_verification_critique','mitcf_3_verification_critique_revision','full_mitcf'];
const SHORT = ['Baseline','MITCF-1','MITCF-2','MITCF-3','Full MITCF'];

export default function AblationPage() {
  const [runs, setRuns] = useState<{run_id:string}[]>([]);
  const [selectedRun, setSelectedRun] = useState('');
  const [rows, setRows] = useState<CondRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/api/experiments`).then(r => r.json()).then((r:{run_id:string}[]) => {
      setRuns(r);
      if (r.length) setSelectedRun(r[r.length-1].run_id);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedRun) return;
    fetch(`${API}/api/experiments/${selectedRun}/condition-metrics`).then(r => r.json()).then(setRows).catch(()=>{});
  }, [selectedRun]);

  const ordered = CONDITIONS.map(c => rows.find(r => r.condition === c)).filter(Boolean) as CondRow[];
  const x = SHORT.slice(0, ordered.length);

  const pl = (yTitle: string) => ({
    paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
    margin: { t: 10, l: 55, r: 10, b: 60 }, height: 240,
    xaxis: { color: '#94a3b8', tickangle: -20, tickfont:{size:10} },
    yaxis: { color: '#94a3b8', title: { text: yTitle, font: { color: '#94a3b8', size: 11 } } },
    legend: { font:{color:'#94a3b8', size:10}, bgcolor:'transparent', orientation:'h' as const, y:-0.3 },
  });

  const moduleActive = [
    { cond: 'baseline', verify: false, critique: false, revise: false, gate: false },
    { cond: 'mitcf_1_verification', verify: true, critique: false, revise: false, gate: false },
    { cond: 'mitcf_2_verification_critique', verify: true, critique: true, revise: false, gate: false },
    { cond: 'mitcf_3_verification_critique_revision', verify: true, critique: true, revise: true, gate: false },
    { cond: 'full_mitcf', verify: true, critique: true, revise: true, gate: true },
  ];

  if (loading) return <div className="text-sm" style={{ color:'var(--text-muted)' }}>Loading ablation data...</div>;

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold" style={{ color:'var(--text-primary)' }}>Ablation Study</h2>
        <p className="text-sm mt-1" style={{ color:'var(--text-muted)' }}>
          5-condition ablation: incrementally adding Verification → Critique → Revision → DecisionGate
        </p>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <label className="text-xs" style={{ color:'var(--text-muted)' }}>Run:</label>
        <select value={selectedRun} onChange={e => setSelectedRun(e.target.value)}
          className="text-xs px-2 py-1 rounded" style={{ background:'var(--bg-card)', border:'1px solid var(--border)', color:'var(--text-primary)' }}>
          {runs.map(r => <option key={r.run_id} value={r.run_id}>{r.run_id}</option>)}
        </select>
      </div>

      {/* Module activation table */}
      <div className="kpi-card mb-6">
        <h3 className="text-sm font-semibold mb-3" style={{ color:'var(--text-primary)' }}>Ablation Conditions — Module Activation</h3>
        <table className="data-table">
          <thead>
            <tr><th>Condition</th><th>VerificationModule</th><th>CritiqueModule</th><th>RevisionModule</th><th>DecisionGate</th></tr>
          </thead>
          <tbody>
            {moduleActive.map(m => (
              <tr key={m.cond}>
                <td className="font-mono text-xs">{m.cond}</td>
                {[m.verify, m.critique, m.revise, m.gate].map((active, i) => (
                  <td key={i}>
                    <span style={{ color: active ? '#22c55e' : '#ef4444', fontWeight: 700 }}>{active ? '✓ Active' : '✗ Off'}</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {ordered.length > 0 && (
        <>
          {/* Main ablation charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <div className="kpi-card">
              <h3 className="text-sm font-semibold mb-3" style={{ color:'var(--text-primary)' }}>Accuracy & TI — Ablation Progression</h3>
              <Plot
                data={[
                  { type:'scatter', mode:'lines+markers', name:'Accuracy', x, y: ordered.map(r=>parseFloat(r.accuracy)), line:{color:'#3b82f6',width:2}, marker:{size:8} },
                  { type:'scatter', mode:'lines+markers', name:'TI', x, y: ordered.map(r=>parseFloat(r.trustworthiness_index)), line:{color:'#22c55e',width:2}, marker:{size:8} },
                ]}
                layout={{...pl('Score'), yaxis:{...pl('Score').yaxis, range:[0,1.1]}}}
                config={{ displayModeBar: false }} style={{ width:'100%' }} />
            </div>

            <div className="kpi-card">
              <h3 className="text-sm font-semibold mb-3" style={{ color:'var(--text-primary)' }}>Failure Rates — Ablation Progression</h3>
              <Plot
                data={[
                  { type:'scatter', mode:'lines+markers', name:'Hallucination Rate', x, y: ordered.map(r=>parseFloat(r.hallucination_rate)), line:{color:'#ef4444',width:2}, marker:{size:8} },
                  { type:'scatter', mode:'lines+markers', name:'Bias Rate', x, y: ordered.map(r=>parseFloat(r.bias_rate)), line:{color:'#f59e0b',width:2}, marker:{size:8} },
                  { type:'scatter', mode:'lines+markers', name:'Attack Succ. Rate', x, y: ordered.map(r=>parseFloat(r.attack_success_rate)), line:{color:'#a855f7',width:2,dash:'dot'}, marker:{size:8} },
                ]}
                layout={{...pl('Rate'), yaxis:{...pl('Rate').yaxis, range:[0,1.1]}}}
                config={{ displayModeBar: false }} style={{ width:'100%' }} />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <div className="kpi-card">
              <h3 className="text-sm font-semibold mb-3" style={{ color:'var(--text-primary)' }}>Robustness & Prevention</h3>
              <Plot
                data={[
                  { type:'bar', name:'Robustness Score', x, y: ordered.map(r=>parseFloat(r.robustness_score)), marker:{color:'#3b82f6'} },
                  { type:'bar', name:'Unsafe Prevention', x, y: ordered.map(r=>parseFloat(r.unsafe_prevention_rate)), marker:{color:'#22c55e'} },
                ]}
                layout={{ ...pl('Score'), barmode:'group' as const }}
                config={{ displayModeBar: false }} style={{ width:'100%' }} />
            </div>

            <div className="kpi-card">
              <h3 className="text-sm font-semibold mb-3" style={{ color:'var(--text-primary)' }}>Computational Cost per Ablation</h3>
              <Plot
                data={[
                  { type:'bar', name:'Avg Model Calls', x, y: ordered.map(r=>parseFloat(r.avg_model_calls)), marker:{color:'#6366f1'} },
                  { type:'bar', name:'Avg Revisions', x, y: ordered.map(r=>parseFloat(r.avg_revisions)), marker:{color:'#f97316'} },
                ]}
                layout={{ ...pl('Count'), barmode:'group' as const }}
                config={{ displayModeBar: false }} style={{ width:'100%' }} />
            </div>
          </div>

          {/* Annotated delta table */}
          <div className="kpi-card overflow-x-auto">
            <h3 className="text-sm font-semibold mb-3" style={{ color:'var(--text-primary)' }}>Incremental Gains — Each Module's Contribution</h3>
            <table className="data-table">
              <thead>
                <tr><th>Step</th><th>Module Added</th><th>ΔTRUST</th><th>ΔAcc</th><th>ΔHall Rate</th><th>ΔBias Rate</th><th>ΔRobustness</th></tr>
              </thead>
              <tbody>
                {ordered.slice(1).map((r, i) => {
                  const prev = ordered[i];
                  const dTI = parseFloat(r.trustworthiness_index) - parseFloat(prev.trustworthiness_index);
                  const dAcc = parseFloat(r.accuracy) - parseFloat(prev.accuracy);
                  const dHall = parseFloat(r.hallucination_rate) - parseFloat(prev.hallucination_rate);
                  const dBias = parseFloat(r.bias_rate) - parseFloat(prev.bias_rate);
                  const dRob = parseFloat(r.robustness_score) - parseFloat(prev.robustness_score);
                  const modules = ['+ Verification','+ Critique','+ Revision','+ DecisionGate'];
                  function delta(v: number, higherBetter: boolean) {
                    const pos = higherBetter ? v > 0 : v < 0;
                    return <span style={{ color: pos ? '#22c55e' : v === 0 ? '#64748b' : '#ef4444', fontWeight:600 }}>
                      {v > 0 ? '+' : ''}{v.toFixed(4)}
                    </span>;
                  }
                  return (
                    <tr key={r.condition}>
                      <td className="font-mono text-xs">{SHORT[i+1]}</td>
                      <td><span className="badge" style={{ background:'rgba(59,130,246,0.1)', color:'#3b82f6' }}>{modules[i]}</span></td>
                      <td>{delta(dTI, true)}</td>
                      <td>{delta(dAcc, true)}</td>
                      <td>{delta(dHall, false)}</td>
                      <td>{delta(dBias, false)}</td>
                      <td>{delta(dRob, true)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
