'use client';
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';

const Plot = dynamic(() => import('react-plotly.js'), { ssr: false });
const API = 'http://localhost:8080';

interface GateRow {
  algorithm: string; fuzzy_gate_score: number; decision_action: string;
  fuzzy_quality: number; fuzzy_safety: number; fuzzy_risk: number;
  fuzzy_uncertainty: number; fuzzy_efficiency: number;
  accept_membership: number; verify_membership: number; revise_membership: number;
  escalate_membership: number; refuse_membership: number; fuzzy_rank: string;
}

const ACTION_COLORS: Record<string, string> = { accept:'#22c55e', verify:'#3b82f6', revise:'#f59e0b', escalate:'#f97316', refuse:'#ef4444' };
const ACTIONS = ['accept','verify','revise','escalate','refuse'];

export default function AgentDecisionsPage() {
  const [gateRows, setGateRows] = useState<GateRow[]>([]);
  const [dist, setDist] = useState<{decision_action:string;count:number;proportion:number}[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<keyof GateRow>('fuzzy_gate_score');
  const [sortDir, setSortDir] = useState<1|-1>(-1);

  useEffect(() => {
    Promise.all([
      fetch(`${API}/api/fuzzy/gate-results`).then(r=>r.json()),
      fetch(`${API}/api/fuzzy/action-distribution`).then(r=>r.json()),
    ]).then(([g,d])=>{setGateRows(g);setDist(d);setLoading(false);}).catch(()=>setLoading(false));
  }, []);

  function toggleSort(k: keyof GateRow) {
    if (sortKey===k) setSortDir(d=>d===1?-1:1);
    else { setSortKey(k); setSortDir(-1); }
  }

  const sorted = [...gateRows].sort((a,b)=>{
    const av=a[sortKey],bv=b[sortKey];
    return (typeof av==='number'&&typeof bv==='number') ? (av<bv?-1:av>bv?1:0)*sortDir : 0;
  });

  const Th=({k,label}:{k:keyof GateRow;label:string})=>(
    <th onClick={()=>toggleSort(k)} style={{cursor:'pointer',userSelect:'none'}}>
      {label}{sortKey===k?(sortDir===1?' ↑':' ↓'):''}
    </th>
  );

  if (loading) return <div className="text-sm" style={{ color:'var(--text-muted)' }}>Loading agent decision data...</div>;

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold" style={{ color:'var(--text-primary)' }}>Agent Decisions</h2>
        <p className="text-sm mt-1" style={{ color:'var(--text-muted)' }}>
          FuzzyDecisionGate output for each of the 20 trained models — gate scores, action decisions, and input contributions.
        </p>
      </div>

      {/* Decision overview */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
        {ACTIONS.map(a => {
          const count = gateRows.filter(r=>r.decision_action===a).length;
          return (
            <div key={a} className="kpi-card text-center p-3" style={{ borderTop:`2px solid ${ACTION_COLORS[a]}` }}>
              <div className="text-xl font-bold" style={{ color:ACTION_COLORS[a] }}>{count}</div>
              <div className="text-xs font-semibold mt-0.5" style={{ color:ACTION_COLORS[a] }}>{a.toUpperCase()}</div>
              <div className="text-xs" style={{ color:'var(--text-muted)' }}>{gateRows.length>0?((count/gateRows.length)*100).toFixed(0):'0'}% of models</div>
            </div>
          );
        })}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="kpi-card">
          <h3 className="text-sm font-semibold mb-3" style={{ color:'var(--text-primary)' }}>Gate Score Distribution</h3>
          <Plot
            data={[{
              type:'bar',
              x:gateRows.map(r=>r.algorithm.replace(/^\d+_/,'')),
              y:gateRows.map(r=>r.fuzzy_gate_score),
              marker:{ color:gateRows.map(r=>ACTION_COLORS[r.decision_action]??'#64748b') },
              text:gateRows.map(r=>r.decision_action.toUpperCase()),
              textposition:'outside' as const, textfont:{size:8,color:'#94a3b8'},
            }]}
            layout={{
              paper_bgcolor:'transparent', plot_bgcolor:'transparent',
              margin:{t:10,l:45,r:10,b:80}, height:260,
              xaxis:{color:'#94a3b8',tickangle:-45,tickfont:{size:9}},
              yaxis:{color:'#94a3b8',range:[0,1.15],title:{text:'Gate Score',font:{color:'#94a3b8',size:11}}},
            }}
            config={{ displayModeBar: false }} style={{ width:'100%' }} />
        </div>

        <div className="kpi-card">
          <h3 className="text-sm font-semibold mb-3" style={{ color:'var(--text-primary)' }}>Fuzzy Input Radar — Top vs Bottom Model</h3>
          {gateRows.length>=2 && (() => {
            const top = gateRows.reduce((best,r)=>r.fuzzy_gate_score>best.fuzzy_gate_score?r:best,gateRows[0]);
            const bot = gateRows.reduce((worst,r)=>r.fuzzy_gate_score<worst.fuzzy_gate_score?r:worst,gateRows[0]);
            const theta = ['Quality','Safety','Risk (inv)','Uncertainty (inv)','Efficiency'];
            return (
              <Plot
                data={[
                  { type:'scatterpolar',fill:'toself',fillcolor:'rgba(34,197,94,0.15)',line:{color:'#22c55e'},name:top.algorithm.replace(/^\d+_/,''),
                    r:[top.fuzzy_quality,top.fuzzy_safety,1-top.fuzzy_risk,1-top.fuzzy_uncertainty,top.fuzzy_efficiency], theta },
                  { type:'scatterpolar',fill:'toself',fillcolor:'rgba(239,68,68,0.15)',line:{color:'#ef4444'},name:bot.algorithm.replace(/^\d+_/,''),
                    r:[bot.fuzzy_quality,bot.fuzzy_safety,1-bot.fuzzy_risk,1-bot.fuzzy_uncertainty,bot.fuzzy_efficiency], theta },
                ]}
                layout={{
                  paper_bgcolor:'transparent',plot_bgcolor:'transparent',
                  polar:{bgcolor:'transparent',radialaxis:{color:'#475569',gridcolor:'#334155',range:[0,1]},angularaxis:{color:'#94a3b8'}},
                  legend:{font:{color:'#94a3b8',size:10},bgcolor:'transparent'},
                  margin:{t:20,l:10,r:10,b:10},height:260,
                }}
                config={{ displayModeBar: false }} style={{ width:'100%' }} />
            );
          })()}
        </div>
      </div>

      {/* Full decision table */}
      <div className="kpi-card overflow-x-auto">
        <h3 className="text-sm font-semibold mb-3" style={{ color:'var(--text-primary)' }}>Decision Table — All Models</h3>
        <table className="data-table">
          <thead>
            <tr>
              <th>Algorithm</th>
              <Th k="fuzzy_gate_score" label="Gate Score" />
              <th>Decision</th>
              <Th k="fuzzy_quality" label="Quality" />
              <Th k="fuzzy_safety" label="Safety" />
              <Th k="fuzzy_risk" label="Risk" />
              <Th k="fuzzy_uncertainty" label="Uncert." />
              <Th k="fuzzy_efficiency" label="Effic." />
              <Th k="accept_membership" label="μ Accept" />
              <Th k="verify_membership" label="μ Verify" />
              <Th k="revise_membership" label="μ Revise" />
              <Th k="escalate_membership" label="μ Escal." />
              <Th k="refuse_membership" label="μ Refuse" />
            </tr>
          </thead>
          <tbody>
            {sorted.map(r=>(
              <tr key={r.algorithm}>
                <td><span className="font-mono text-xs">{r.algorithm}</span></td>
                <td style={{ fontWeight:700, color:'var(--accent)' }}>{r.fuzzy_gate_score.toFixed(4)}</td>
                <td><span className="badge font-semibold" style={{ background:`${ACTION_COLORS[r.decision_action]}20`, color:ACTION_COLORS[r.decision_action] }}>{r.decision_action.toUpperCase()}</span></td>
                {(['fuzzy_quality','fuzzy_safety','fuzzy_risk','fuzzy_uncertainty','fuzzy_efficiency'] as const).map(k=>(
                  <td key={k} className="font-mono text-xs">{r[k].toFixed(3)}</td>
                ))}
                {(['accept_membership','verify_membership','revise_membership','escalate_membership','refuse_membership'] as const).map(k=>(
                  <td key={k} className="font-mono text-xs" style={{ color:r[k]>0.5?'#22c55e':undefined }}>{r[k].toFixed(3)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs mt-2" style={{ color:'var(--text-muted)' }}>
          Source: <code>graph/fuzzy_gate/fuzzy_gate_results.csv</code>. Click column headers to sort.
        </p>
      </div>
    </div>
  );
}
