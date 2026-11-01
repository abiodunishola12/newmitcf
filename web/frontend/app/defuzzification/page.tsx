'use client';
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';

const Plot = dynamic(() => import('react-plotly.js'), { ssr: false });
const API = 'http://localhost:8080';

interface GateRow {
  algorithm: string; fuzzy_gate_score: number; decision_action: string;
  accept_membership: number; verify_membership: number; revise_membership: number;
  escalate_membership: number; refuse_membership: number;
}
interface EvalResult { gate_score: number; action: string; memberships: Record<string, number>; }

const CENTROIDS: Record<string, number> = { refuse:0.05, escalate:0.25, revise:0.45, verify:0.65, accept:0.90 };
const ACOLORS: Record<string, string> = { accept:'#22c55e', verify:'#3b82f6', revise:'#f59e0b', escalate:'#f97316', refuse:'#ef4444' };

export default function DefuzzificationPage() {
  const [gateRows, setGateRows] = useState<GateRow[]>([]);
  const [selectedAlgo, setSelectedAlgo] = useState('');
  const [evalResult, setEvalResult] = useState<EvalResult | null>(null);
  const [inputs, setInputs] = useState({ quality:0.8, safety:0.9, risk:0.1, uncertainty:0.15, efficiency:0.75 });
  const [loading, setLoading] = useState(true);
  const [evalLoading, setEvalLoading] = useState(false);

  useEffect(() => {
    fetch(`${API}/api/fuzzy/gate-results`).then(r=>r.json()).then((rows: GateRow[]) => {
      setGateRows(rows);
      if (rows.length) setSelectedAlgo(rows[0].algorithm);
      setLoading(false);
    }).catch(()=>setLoading(false));
  }, []);

  async function runEval() {
    setEvalLoading(true);
    try {
      const r = await fetch(`${API}/api/fuzzy/evaluate`, {
        method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(inputs),
      });
      setEvalResult(await r.json());
    } finally { setEvalLoading(false); }
  }

  const selRow = gateRows.find(r => r.algorithm === selectedAlgo);

  function centroidFormula(row: GateRow | EvalResult): { score: number; memberships: Record<string, number> } {
    if ('fuzzy_gate_score' in row) {
      return {
        score: row.fuzzy_gate_score,
        memberships: { accept:row.accept_membership, verify:row.verify_membership, revise:row.revise_membership, escalate:row.escalate_membership, refuse:row.refuse_membership },
      };
    }
    return { score: row.gate_score, memberships: row.memberships };
  }

  function buildDefuzzPlot(m: Record<string, number>, score: number) {
    return [
      ...Object.entries(m).map(([a, v]) => ({
        type:'bar' as const, name:a.toUpperCase(), x:[a.toUpperCase()], y:[v],
        marker:{ color:ACOLORS[a] }, showlegend:true,
        text:[v.toFixed(3)], textposition:'outside' as const, textfont:{size:11,color:ACOLORS[a]},
      })),
      {
        type:'scatter' as const, mode:'lines' as const, name:`Gate Score: ${score.toFixed(3)}`,
        x:['REFUSE','ESCALATE','REVISE','VERIFY','ACCEPT'],
        y:Array(5).fill(score),
        line:{color:'#ffffff',dash:'dash',width:1.5}, showlegend:true,
      },
    ];
  }

  if (loading) return <div className="text-sm" style={{ color:'var(--text-muted)' }}>Loading defuzzification data...</div>;

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold" style={{ color:'var(--text-primary)' }}>Defuzzification</h2>
        <p className="text-sm mt-1" style={{ color:'var(--text-muted)' }}>
          Centroid defuzzification: gate_score = Σ(membership × centroid) / Σ(membership).
          The final decision is the action whose centroid is nearest to gate_score.
        </p>
      </div>

      {/* Formula card */}
      <div className="kpi-card mb-6" style={{ borderLeft:'3px solid #3b82f6' }}>
        <h3 className="text-sm font-semibold mb-2" style={{ color:'var(--text-primary)' }}>Centroid Defuzzification Formula</h3>
        <pre className="p-3 rounded text-xs overflow-auto" style={{ background:'rgba(0,0,0,0.3)', color:'#93c5fd' }}>
{`gate_score = Σ(μ_action × centroid_action) / Σ(μ_action)

Centroids:
  refuse   = 0.05
  escalate = 0.25
  revise   = 0.45
  verify   = 0.65
  accept   = 0.90

decision = argmin |gate_score − centroid|`}
        </pre>
        <p className="text-xs mt-2" style={{ color:'var(--text-muted)' }}>
          Source: <code>mitcf_pipeline/fuzzy_gate.py</code> — <code>_defuzzify()</code>, <code>_select_action()</code>
        </p>
      </div>

      {/* Algorithm viewer */}
      <div className="kpi-card mb-6">
        <div className="flex items-center gap-3 mb-3">
          <h3 className="text-sm font-semibold" style={{ color:'var(--text-primary)' }}>Algorithm Defuzzification Result</h3>
          <select value={selectedAlgo} onChange={e=>setSelectedAlgo(e.target.value)}
            className="text-xs px-2 py-1 rounded" style={{ background:'var(--bg-card)', border:'1px solid var(--border)', color:'var(--text-primary)' }}>
            {gateRows.map(r=><option key={r.algorithm} value={r.algorithm}>{r.algorithm}</option>)}
          </select>
        </div>
        {selRow && (() => {
          const { score, memberships } = centroidFormula(selRow);
          return (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <Plot
                  data={buildDefuzzPlot(memberships, score)}
                  layout={{
                    paper_bgcolor:'transparent', plot_bgcolor:'transparent',
                    margin:{t:10,l:45,r:10,b:50}, height:260,
                    xaxis:{color:'#94a3b8'}, yaxis:{color:'#94a3b8',range:[0,1.2],title:{text:'Membership Degree',font:{color:'#94a3b8',size:11}}},
                    legend:{font:{color:'#94a3b8',size:10},bgcolor:'transparent',orientation:'h' as const,y:-0.3},
                    barmode:'group' as const,
                  }}
                  config={{ displayModeBar: false }} style={{ width:'100%' }} />
              </div>
              <div className="space-y-3">
                <div className="p-4 rounded-lg text-center" style={{ background:`${ACOLORS[selRow.decision_action]}15`, border:`1px solid ${ACOLORS[selRow.decision_action]}40` }}>
                  <div className="text-xs mb-1" style={{ color:'var(--text-muted)' }}>Decision</div>
                  <div className="text-3xl font-bold" style={{ color:ACOLORS[selRow.decision_action] }}>{selRow.decision_action.toUpperCase()}</div>
                  <div className="text-sm mt-1" style={{ color:'var(--text-secondary)' }}>Gate Score: <span className="font-mono">{score.toFixed(4)}</span></div>
                  <div className="text-xs mt-1" style={{ color:'var(--text-muted)' }}>Centroid: {CENTROIDS[selRow.decision_action]}</div>
                </div>
                <div className="space-y-2">
                  {Object.entries(memberships).sort((a,b)=>b[1]-a[1]).map(([action, mu]) => (
                    <div key={action}>
                      <div className="flex justify-between text-xs mb-1">
                        <span style={{ color:ACOLORS[action] }}>{action.toUpperCase()}</span>
                        <span className="font-mono" style={{ color:'var(--text-secondary)' }}>{mu.toFixed(4)}</span>
                      </div>
                      <div className="h-2 rounded overflow-hidden" style={{ background:'rgba(255,255,255,0.05)' }}>
                        <div className="h-full rounded" style={{ width:`${mu*100}%`, background:ACOLORS[action] }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Interactive evaluator */}
      <div className="kpi-card">
        <h3 className="text-sm font-semibold mb-3" style={{ color:'var(--text-primary)' }}>Interactive Evaluator</h3>
        <p className="text-xs mb-4" style={{ color:'var(--text-muted)' }}>Set custom fuzzy input values and run the FuzzyDecisionGate live:</p>
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-4 mb-4">
          {(Object.keys(inputs) as Array<keyof typeof inputs>).map(k => (
            <div key={k}>
              <label className="text-xs block mb-1 capitalize" style={{ color:'var(--text-muted)' }}>{k}</label>
              <input type="range" min={0} max={1} step={0.05} value={inputs[k]}
                onChange={e=>setInputs(prev=>({...prev,[k]:parseFloat(e.target.value)}))} className="w-full" />
              <span className="text-xs font-mono" style={{ color:'#3b82f6' }}>{inputs[k].toFixed(2)}</span>
            </div>
          ))}
        </div>
        <button onClick={runEval} disabled={evalLoading}
          className="btn-primary text-sm px-4 py-2 rounded"
          style={{ opacity:evalLoading?0.6:1 }}>
          {evalLoading ? 'Evaluating...' : 'Run FuzzyDecisionGate'}
        </button>
        {evalResult && (
          <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="p-4 rounded-lg text-center" style={{ background:`${ACOLORS[evalResult.action]}15`, border:`1px solid ${ACOLORS[evalResult.action]}40` }}>
              <div className="text-xs mb-1" style={{ color:'var(--text-muted)' }}>Decision</div>
              <div className="text-3xl font-bold" style={{ color:ACOLORS[evalResult.action] }}>{evalResult.action.toUpperCase()}</div>
              <div className="text-sm mt-1" style={{ color:'var(--text-secondary)' }}>Gate Score: <span className="font-mono">{evalResult.gate_score.toFixed(4)}</span></div>
            </div>
            <div>
              <Plot
                data={buildDefuzzPlot(evalResult.memberships, evalResult.gate_score)}
                layout={{
                  paper_bgcolor:'transparent', plot_bgcolor:'transparent',
                  margin:{t:10,l:45,r:10,b:50}, height:200,
                  xaxis:{color:'#94a3b8'}, yaxis:{color:'#94a3b8',range:[0,1.2]},
                  barmode:'group' as const,
                  legend:{font:{color:'#94a3b8',size:9},bgcolor:'transparent',orientation:'h' as const,y:-0.4},
                }}
                config={{ displayModeBar: false }} style={{ width:'100%' }} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
