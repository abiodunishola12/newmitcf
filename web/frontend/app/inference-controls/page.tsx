'use client';
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';

const Plot = dynamic(() => import('react-plotly.js'), { ssr: false });
const API = 'http://localhost:8080';

interface EvalResult { gate_score: number; action: string; memberships: Record<string, number>; }
interface GateRow {
  algorithm: string; fuzzy_quality: number; fuzzy_safety: number; fuzzy_risk: number;
  fuzzy_uncertainty: number; fuzzy_efficiency: number; fuzzy_gate_score: number; decision_action: string;
  accept_membership: number; verify_membership: number; revise_membership: number;
  escalate_membership: number; refuse_membership: number;
}

const ACOLORS: Record<string, string> = { accept:'#22c55e', verify:'#3b82f6', revise:'#f59e0b', escalate:'#f97316', refuse:'#ef4444' };

const INPUTS: { key: keyof typeof defaultInputs; label: string; description: string }[] = [
  { key: 'quality', label: 'Quality', description: 'Output quality score (0=poor, 1=excellent)' },
  { key: 'safety', label: 'Safety', description: 'Safety alignment score (0=unsafe, 1=safe)' },
  { key: 'risk', label: 'Risk', description: 'Risk level (0=none, 1=high risk)' },
  { key: 'uncertainty', label: 'Uncertainty', description: 'Epistemic uncertainty (0=certain, 1=highly uncertain)' },
  { key: 'efficiency', label: 'Efficiency', description: 'Resource efficiency (0=inefficient, 1=efficient)' },
];

const defaultInputs = { quality: 0.75, safety: 0.85, risk: 0.15, uncertainty: 0.20, efficiency: 0.70 };

export default function InferenceControlsPage() {
  const [inputs, setInputs] = useState(defaultInputs);
  const [result, setResult] = useState<EvalResult | null>(null);
  const [history, setHistory] = useState<Array<{ inputs: typeof defaultInputs; result: EvalResult }>>([]);
  const [gateRows, setGateRows] = useState<GateRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [gateLoading, setGateLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/api/fuzzy/gate-results`).then(r=>r.json()).then(setGateRows).catch(()=>{}).finally(()=>setGateLoading(false));
  }, []);

  async function evaluate() {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/fuzzy/evaluate`, {
        method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(inputs),
      });
      const res: EvalResult = await r.json();
      setResult(res);
      setHistory(prev => [{ inputs: { ...inputs }, result: res }, ...prev].slice(0, 10));
    } finally { setLoading(false); }
  }

  function loadPreset(name: string) {
    const presets: Record<string, typeof defaultInputs> = {
      'Trustworthy': { quality:0.95, safety:0.95, risk:0.05, uncertainty:0.05, efficiency:0.90 },
      'Uncertain': { quality:0.50, safety:0.60, risk:0.45, uncertainty:0.65, efficiency:0.50 },
      'High Risk': { quality:0.30, safety:0.20, risk:0.85, uncertainty:0.80, efficiency:0.30 },
      'Borderline': { quality:0.55, safety:0.55, risk:0.45, uncertainty:0.50, efficiency:0.55 },
    };
    if (presets[name]) setInputs(presets[name]);
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold" style={{ color:'var(--text-primary)' }}>Inference Controls</h2>
        <p className="text-sm mt-1" style={{ color:'var(--text-muted)' }}>
          Live evaluation of the FuzzyDecisionGate — adjust inputs and see the Mamdani inference output in real time.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Controls panel */}
        <div className="lg:col-span-1 space-y-4">
          <div className="kpi-card">
            <h3 className="text-sm font-semibold mb-3" style={{ color:'var(--text-primary)' }}>Presets</h3>
            <div className="flex flex-wrap gap-2 mb-4">
              {['Trustworthy','Uncertain','High Risk','Borderline'].map(p => (
                <button key={p} onClick={() => loadPreset(p)}
                  className="text-xs px-3 py-1 rounded" style={{ background:'rgba(59,130,246,0.1)', border:'1px solid rgba(59,130,246,0.3)', color:'#93c5fd', cursor:'pointer' }}>
                  {p}
                </button>
              ))}
            </div>
            <div className="space-y-4">
              {INPUTS.map(({ key, label, description }) => (
                <div key={key}>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs font-medium" style={{ color:'var(--text-primary)' }}>{label}</label>
                    <span className="text-xs font-mono font-bold" style={{ color:'#3b82f6' }}>{inputs[key].toFixed(2)}</span>
                  </div>
                  <input type="range" min={0} max={1} step={0.05} value={inputs[key]}
                    onChange={e=>setInputs(prev=>({...prev,[key]:parseFloat(e.target.value)}))} className="w-full" />
                  <div className="text-xs mt-0.5" style={{ color:'var(--text-muted)', fontSize:'10px' }}>{description}</div>
                </div>
              ))}
            </div>
            <button onClick={evaluate} disabled={loading}
              className="btn-primary w-full mt-4 py-2 rounded text-sm font-semibold"
              style={{ opacity:loading?0.6:1 }}>
              {loading ? 'Running...' : 'Evaluate Gate'}
            </button>
          </div>
        </div>

        {/* Result panel */}
        <div className="lg:col-span-2 space-y-4">
          {result && (
            <div className="kpi-card">
              <div className="flex items-center gap-4 mb-4">
                <div className="p-4 rounded-lg text-center" style={{ background:`${ACOLORS[result.action]}15`, border:`1px solid ${ACOLORS[result.action]}40`, minWidth:'120px' }}>
                  <div className="text-xs" style={{ color:'var(--text-muted)' }}>Decision</div>
                  <div className="text-2xl font-bold mt-1" style={{ color:ACOLORS[result.action] }}>{result.action.toUpperCase()}</div>
                  <div className="text-xs mt-1 font-mono" style={{ color:'var(--text-secondary)' }}>score: {result.gate_score.toFixed(4)}</div>
                </div>
                <div className="flex-1">
                  <div className="text-xs mb-1 font-semibold" style={{ color:'var(--text-primary)' }}>Action Memberships</div>
                  {Object.entries(result.memberships).sort((a,b)=>b[1]-a[1]).map(([a, v]) => (
                    <div key={a} className="mb-1">
                      <div className="flex justify-between text-xs mb-0.5">
                        <span style={{ color:ACOLORS[a] }}>{a.toUpperCase()}</span>
                        <span className="font-mono" style={{ color:'var(--text-secondary)' }}>{v.toFixed(4)}</span>
                      </div>
                      <div className="h-1.5 rounded overflow-hidden" style={{ background:'rgba(255,255,255,0.05)' }}>
                        <div className="h-full rounded" style={{ width:`${v*100}%`, background:ACOLORS[a] }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <Plot
                data={[{
                  type:'bar', x:Object.keys(result.memberships).map(a=>a.toUpperCase()), y:Object.values(result.memberships),
                  marker:{ color:Object.keys(result.memberships).map(a=>ACOLORS[a]) },
                  text:Object.values(result.memberships).map(v=>v.toFixed(3)), textposition:'outside' as const, textfont:{size:10,color:'#94a3b8'},
                }]}
                layout={{
                  paper_bgcolor:'transparent', plot_bgcolor:'transparent',
                  margin:{t:10,l:45,r:10,b:40}, height:180,
                  xaxis:{color:'#94a3b8'}, yaxis:{color:'#94a3b8',range:[0,1.2]},
                  shapes:[{type:'line',x0:-0.5,x1:4.5,y0:result.gate_score,y1:result.gate_score,line:{color:'#fff',dash:'dash',width:1}}],
                  annotations:[{x:4.8,y:result.gate_score,text:`Gate: ${result.gate_score.toFixed(3)}`,showarrow:false,font:{size:9,color:'#fff'}}],
                }}
                config={{ displayModeBar: false }} style={{ width:'100%' }} />
            </div>
          )}

          {/* History */}
          {history.length > 0 && (
            <div className="kpi-card">
              <h3 className="text-sm font-semibold mb-3" style={{ color:'var(--text-primary)' }}>Evaluation History (last 10)</h3>
              <table className="data-table">
                <thead><tr><th>Quality</th><th>Safety</th><th>Risk</th><th>Uncert.</th><th>Effic.</th><th>Gate Score</th><th>Decision</th></tr></thead>
                <tbody>
                  {history.map((h, i) => (
                    <tr key={i}>
                      {(['quality','safety','risk','uncertainty','efficiency'] as const).map(k => (
                        <td key={k} className="font-mono text-xs">{h.inputs[k].toFixed(2)}</td>
                      ))}
                      <td className="font-mono text-xs">{h.result.gate_score.toFixed(4)}</td>
                      <td><span style={{ color:ACOLORS[h.result.action], fontWeight:600 }}>{h.result.action.toUpperCase()}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Gate score distribution from real data */}
          {!gateLoading && gateRows.length > 0 && (
            <div className="kpi-card">
              <h3 className="text-sm font-semibold mb-3" style={{ color:'var(--text-primary)' }}>Reference: Gate Scores from 20 Trained Models</h3>
              <Plot
                data={[{
                  type:'bar',
                  x: gateRows.map(r=>r.algorithm.replace(/^\d+_/,'')),
                  y: gateRows.map(r=>r.fuzzy_gate_score),
                  marker:{ color: gateRows.map(r=>ACOLORS[r.decision_action]??'#64748b') },
                  text: gateRows.map(r=>r.decision_action.toUpperCase()),
                  textposition:'outside' as const, textfont:{size:8,color:'#94a3b8'},
                }]}
                layout={{
                  paper_bgcolor:'transparent', plot_bgcolor:'transparent',
                  margin:{t:10,l:45,r:10,b:80}, height:220,
                  xaxis:{color:'#94a3b8',tickangle:-45,tickfont:{size:9}},
                  yaxis:{color:'#94a3b8',range:[0,1.15],title:{text:'Gate Score',font:{color:'#94a3b8',size:11}}},
                }}
                config={{ displayModeBar: false }} style={{ width:'100%' }} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
