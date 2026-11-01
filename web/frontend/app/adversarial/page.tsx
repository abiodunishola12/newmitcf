'use client';
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';

const Plot = dynamic(() => import('react-plotly.js'), { ssr: false });
const API = 'http://localhost:8080';

interface CondRow {
  condition: string; accuracy: string; attack_success_rate: string; robustness_score: string;
  unsafe_prevention_rate: string; hallucination_rate: string; bias_rate: string;
  incorrect_correction_rate: string; refusal_error_rate: string;
}

const CONDITIONS = ['baseline','mitcf_1_verification','mitcf_2_verification_critique','mitcf_3_verification_critique_revision','full_mitcf'];
const SHORT = ['Baseline','MITCF-1','MITCF-2','MITCF-3','Full MITCF'];
const COLORS = ['#ef4444','#f59e0b','#3b82f6','#6366f1','#22c55e'];

export default function AdversarialPage() {
  const [runs, setRuns] = useState<{run_id:string}[]>([]);
  const [selectedRun, setSelectedRun] = useState('');
  const [rows, setRows] = useState<CondRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/api/experiments`).then(r => r.json()).then((r:{run_id:string}[]) => {
      setRuns(r);
      if (r.length) setSelectedRun(r[r.length-1].run_id);
      setLoading(false);
    }).catch(()=>setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedRun) return;
    fetch(`${API}/api/experiments/${selectedRun}/condition-metrics`).then(r=>r.json()).then(setRows).catch(()=>{});
  }, [selectedRun]);

  const ordered = CONDITIONS.map(c=>rows.find(r=>r.condition===c)).filter(Boolean) as CondRow[];
  const x = SHORT.slice(0, ordered.length);

  const pl = (yTitle: string) => ({
    paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
    margin: { t: 10, l: 55, r: 10, b: 60 }, height: 260,
    xaxis: { color: '#94a3b8', tickangle: -20, tickfont:{size:10} },
    yaxis: { color: '#94a3b8', range:[0,1.1], title: { text: yTitle, font: { color: '#94a3b8', size: 11 } } },
    legend: { font:{color:'#94a3b8',size:10}, bgcolor:'transparent' },
  });

  const fullMitcf = ordered.find(r=>r.condition==='full_mitcf');
  const baseline = ordered.find(r=>r.condition==='baseline');

  if (loading) return <div className="text-sm" style={{ color:'var(--text-muted)' }}>Loading adversarial robustness data...</div>;

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold" style={{ color:'var(--text-primary)' }}>Adversarial Robustness</h2>
        <p className="text-sm mt-1" style={{ color:'var(--text-muted)' }}>
          Robustness against adversarial inputs — attack success rate, prevention, and unsafe output containment across conditions
        </p>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <label className="text-xs" style={{ color:'var(--text-muted)' }}>Run:</label>
        <select value={selectedRun} onChange={e=>setSelectedRun(e.target.value)}
          className="text-xs px-2 py-1 rounded" style={{ background:'var(--bg-card)', border:'1px solid var(--border)', color:'var(--text-primary)' }}>
          {runs.map(r=><option key={r.run_id} value={r.run_id}>{r.run_id}</option>)}
        </select>
      </div>

      {/* KPI highlight cards */}
      {fullMitcf && baseline && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          {[
            { label:'Attack Succ. Rate (Baseline)', val: parseFloat(baseline.attack_success_rate), lowerBetter: true },
            { label:'Attack Succ. Rate (Full MITCF)', val: parseFloat(fullMitcf.attack_success_rate), lowerBetter: true },
            { label:'Robustness Score (Baseline)', val: parseFloat(baseline.robustness_score), lowerBetter: false },
            { label:'Robustness Score (Full MITCF)', val: parseFloat(fullMitcf.robustness_score), lowerBetter: false },
          ].map(({ label, val, lowerBetter }) => {
            const good = lowerBetter ? val < 0.1 : val > 0.8;
            return (
              <div key={label} className="kpi-card text-center p-3">
                <div className="text-xs mb-1" style={{ color:'var(--text-muted)', fontSize:'10px' }}>{label}</div>
                <div className="text-2xl font-bold" style={{ color: good ? '#22c55e' : '#ef4444' }}>
                  {(val*100).toFixed(1)}%
                </div>
              </div>
            );
          })}
        </div>
      )}

      {ordered.length > 0 && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <div className="kpi-card">
              <h3 className="text-sm font-semibold mb-3" style={{ color:'var(--text-primary)' }}>Attack Success Rate per Condition</h3>
              <Plot
                data={[{
                  type:'bar', x, y: ordered.map(r=>parseFloat(r.attack_success_rate)),
                  marker: { color: ordered.map(r=>parseFloat(r.attack_success_rate)===0?'#22c55e':'#ef4444') },
                  text: ordered.map(r=>`${(parseFloat(r.attack_success_rate)*100).toFixed(0)}%`),
                  textposition:'outside', textfont:{size:11},
                }]}
                layout={{...pl('Attack Success Rate (lower=better)'), shapes:[{type:'line',x0:-0.5,x1:4.5,y0:0,y1:0,line:{color:'#22c55e',dash:'dash',width:1}}]}}
                config={{ displayModeBar: false }} style={{ width:'100%' }} />
            </div>

            <div className="kpi-card">
              <h3 className="text-sm font-semibold mb-3" style={{ color:'var(--text-primary)' }}>Robustness Score per Condition</h3>
              <Plot
                data={[{
                  type:'bar', x, y: ordered.map(r=>parseFloat(r.robustness_score)),
                  marker: { color: ordered.map(r=>parseFloat(r.robustness_score)>=0.9?'#22c55e':parseFloat(r.robustness_score)>=0.5?'#f59e0b':'#ef4444') },
                  text: ordered.map(r=>parseFloat(r.robustness_score).toFixed(3)),
                  textposition:'outside', textfont:{size:11},
                }]}
                layout={pl('Robustness Score (higher=better)')}
                config={{ displayModeBar: false }} style={{ width:'100%' }} />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <div className="kpi-card">
              <h3 className="text-sm font-semibold mb-3" style={{ color:'var(--text-primary)' }}>Unsafe Prevention Rate</h3>
              <Plot
                data={[{
                  type:'scatter', mode:'lines+markers',
                  x, y: ordered.map(r=>parseFloat(r.unsafe_prevention_rate)),
                  line:{color:'#3b82f6',width:2}, marker:{size:10, color:COLORS.slice(0,ordered.length)},
                  fill:'tozeroy', fillcolor:'rgba(59,130,246,0.08)',
                }]}
                layout={pl('Unsafe Prevention Rate')}
                config={{ displayModeBar: false }} style={{ width:'100%' }} />
            </div>

            <div className="kpi-card">
              <h3 className="text-sm font-semibold mb-3" style={{ color:'var(--text-primary)' }}>Adversarial Metrics Overview</h3>
              <Plot
                data={[
                  { type:'bar', name:'Robustness', x, y: ordered.map(r=>parseFloat(r.robustness_score)), marker:{color:'#22c55e'} },
                  { type:'bar', name:'Unsafe Prev.', x, y: ordered.map(r=>parseFloat(r.unsafe_prevention_rate)), marker:{color:'#3b82f6'} },
                  { type:'bar', name:'Attack Succ. (inv)', x, y: ordered.map(r=>1-parseFloat(r.attack_success_rate)), marker:{color:'#a855f7'} },
                ]}
                layout={{ ...pl('Score'), barmode:'group' as const }}
                config={{ displayModeBar: false }} style={{ width:'100%' }} />
            </div>
          </div>

          {/* Detail table */}
          <div className="kpi-card overflow-x-auto">
            <h3 className="text-sm font-semibold mb-3" style={{ color:'var(--text-primary)' }}>Robustness Detail by Condition</h3>
            <table className="data-table">
              <thead>
                <tr><th>Condition</th><th>Attack Succ. Rate</th><th>Robustness Score</th><th>Unsafe Prev.</th><th>Refusal Error</th><th>Incorrect Correction</th></tr>
              </thead>
              <tbody>
                {ordered.map((r,i) => (
                  <tr key={r.condition}>
                    <td><span style={{ color:COLORS[i], fontWeight:600 }} className="font-mono text-xs">{r.condition}</span></td>
                    <td style={{ color:parseFloat(r.attack_success_rate)===0?'#22c55e':'#ef4444', fontWeight:600 }}>
                      {(parseFloat(r.attack_success_rate)*100).toFixed(1)}%
                    </td>
                    <td style={{ color:parseFloat(r.robustness_score)>=0.9?'#22c55e':'#f59e0b', fontWeight:600 }}>
                      {parseFloat(r.robustness_score).toFixed(4)}
                    </td>
                    <td style={{ color:parseFloat(r.unsafe_prevention_rate)>=0.9?'#22c55e':'#f59e0b' }}>
                      {(parseFloat(r.unsafe_prevention_rate)*100).toFixed(1)}%
                    </td>
                    <td>{(parseFloat(r.refusal_error_rate)*100).toFixed(1)}%</td>
                    <td>{(parseFloat(r.incorrect_correction_rate)*100).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Adversarial robustness note */}
          <div className="kpi-card mt-6" style={{ borderLeft:'3px solid #f59e0b' }}>
            <h3 className="text-sm font-semibold mb-2" style={{ color:'var(--text-primary)' }}>How Adversarial Robustness is Measured</h3>
            <p className="text-sm" style={{ color:'var(--text-secondary)' }}>
              The MITCF pipeline evaluates robustness by routing adversarially-tagged benchmark items through the full control stack.
              <code className="text-xs mx-1 px-1 py-0.5 rounded" style={{ background:'rgba(0,0,0,0.2)' }}>attack_success_rate</code>
              measures what fraction of adversarial inputs reached the output without correction or refusal.
              <code className="text-xs mx-1 px-1 py-0.5 rounded" style={{ background:'rgba(0,0,0,0.2)' }}>robustness_score = 1 − attack_success_rate</code>.
              Source: <code className="text-xs">mitcf_pipeline/evaluation.py</code>
            </p>
          </div>
        </>
      )}
    </div>
  );
}
