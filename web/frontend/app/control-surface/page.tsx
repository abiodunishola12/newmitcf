'use client';
import { useState } from 'react';
import dynamic from 'next/dynamic';

const Plot = dynamic(() => import('react-plotly.js'), { ssr: false });
const API = 'http://localhost:8080';

const ACTION_COLORS: Record<string, string> = { accept:'#22c55e', verify:'#3b82f6', revise:'#f59e0b', escalate:'#f97316', refuse:'#ef4444' };
const ACTION_CENTROIDS: Record<string, number> = { refuse:0.05, escalate:0.25, revise:0.45, verify:0.65, accept:0.90 };

const N = 15;

function generateSurface(fixedInputs: Record<string, number>, xKey: string, yKey: string) {
  const xs = Array.from({length:N},(_,i)=>i/(N-1));
  const ys = Array.from({length:N},(_,i)=>i/(N-1));
  const zScores: number[][] = [];
  const zActions: string[][] = [];

  for (const y of ys) {
    const row: number[] = [];
    const rowA: string[] = [];
    for (const x of xs) {
      const inputs = { ...fixedInputs, [xKey]:x, [yKey]:y };
      const { q, s, r, u, e } = { q:inputs.quality, s:inputs.safety, r:inputs.risk, u:inputs.uncertainty, e:inputs.efficiency };
      // Simplified Mamdani inference matching fuzzy_gate.py logic
      const lowQ = q<0.4 ? Math.max(0,1-(q/0.2)) : 0;
      const midQ = q<0.5 ? Math.max(0,(q-0.3)/0.2) : Math.max(0,(0.7-q)/0.2);
      const hiQ = q>0.6 ? Math.min(1,(q-0.6)/0.2) : 0;
      const lowR = r<0.4 ? Math.max(0,1-(r/0.2)) : 0;
      const midR = r<0.5 ? Math.max(0,(r-0.3)/0.2) : Math.max(0,(0.7-r)/0.2);
      const hiR = r>0.6 ? Math.min(1,(r-0.6)/0.2) : 0;
      const lowU = u<0.4 ? Math.max(0,1-(u/0.2)) : 0;
      const hiS = s>0.6 ? Math.min(1,(s-0.6)/0.2) : 0;
      const hiE = e>0.6 ? Math.min(1,(e-0.6)/0.2) : 0;
      const accept_m = Math.max(Math.min(hiQ,lowR,lowU), Math.min(hiQ,hiS,hiE));
      const verify_m = Math.max(Math.min(hiQ,lowR), Math.min(midQ,midR));
      const revise_m = Math.max(Math.min(midQ,1-hiS), Math.min(lowQ,midR));
      const escalate_m = Math.max(Math.min(midQ,hiR), Math.min(1-hiS,hiR));
      const hiU = u>0.6 ? Math.min(1,(u-0.6)/0.2) : 0;
      const refuse_m = Math.max(Math.min(lowQ,hiR), Math.min(1-hiS,hiR), Math.min(hiR,hiU));
      const refuse_m2 = Math.max(refuse_m, Math.min(lowQ,hiU));
      const m: Record<string,number> = { accept:accept_m, verify:verify_m, revise:revise_m, escalate:escalate_m, refuse:refuse_m2 };
      const total = Object.values(m).reduce((a,b)=>a+b,0);
      const score = total < 0.001 ? 0.5 : Object.entries(m).reduce((s,[k,v])=>s+v*ACTION_CENTROIDS[k],0)/total;
      const action = Object.entries(ACTION_CENTROIDS).reduce((best,[k])=>Math.abs(score-ACTION_CENTROIDS[k])<Math.abs(score-ACTION_CENTROIDS[best])?k:best,'accept');
      row.push(score);
      rowA.push(action);
    }
    zScores.push(row);
    zActions.push(rowA);
  }
  return { xs, ys, zScores, zActions };
}

export default function ControlSurfacePage() {
  const [xAxis, setXAxis] = useState('quality');
  const [yAxis, setYAxis] = useState('risk');
  const [fixed, setFixed] = useState({ quality:0.7, safety:0.8, risk:0.2, uncertainty:0.2, efficiency:0.7 });
  const [viewMode, setViewMode] = useState<'surface'|'heatmap'>('heatmap');

  const axes = ['quality','safety','risk','uncertainty','efficiency'];
  const fixedInputs = { ...fixed };

  const { xs, ys, zScores } = generateSurface(fixedInputs, xAxis, yAxis);

  const actionColorMap = [[0,'#ef4444'],[0.25,'#f97316'],[0.45,'#f59e0b'],[0.65,'#3b82f6'],[0.90,'#22c55e'],[1,'#22c55e']] as [number,string][];

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold" style={{ color:'var(--text-primary)' }}>Control Surface</h2>
        <p className="text-sm mt-1" style={{ color:'var(--text-muted)' }}>
          2D slice through the fuzzy gate score surface — derived from the actual Mamdani inference implementation.
        </p>
      </div>

      <div className="kpi-card mb-4">
        <div className="flex flex-wrap gap-4 mb-4">
          <div>
            <label className="text-xs block mb-1" style={{ color:'var(--text-muted)' }}>X Axis</label>
            <select value={xAxis} onChange={e=>setXAxis(e.target.value)} className="text-xs px-2 py-1 rounded" style={{ background:'var(--bg-card)', border:'1px solid var(--border)', color:'var(--text-primary)' }}>
              {axes.map(a=><option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs block mb-1" style={{ color:'var(--text-muted)' }}>Y Axis</label>
            <select value={yAxis} onChange={e=>setYAxis(e.target.value)} className="text-xs px-2 py-1 rounded" style={{ background:'var(--bg-card)', border:'1px solid var(--border)', color:'var(--text-primary)' }}>
              {axes.map(a=><option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div className="flex gap-1 items-end">
            {(['heatmap','surface'] as const).map(m=>(
              <button key={m} onClick={()=>setViewMode(m)} className="text-xs px-3 py-1 rounded" style={{ background:viewMode===m?'var(--accent)':'var(--bg-card)', color:viewMode===m?'#fff':'var(--text-secondary)', border:'1px solid var(--border)' }}>{m}</button>
            ))}
          </div>
        </div>

        {/* Fixed inputs */}
        <div className="flex flex-wrap gap-4 mb-4">
          {axes.filter(a=>a!==xAxis&&a!==yAxis).map(a=>(
            <div key={a} className="flex items-center gap-2">
              <label className="text-xs capitalize" style={{ color:'var(--text-muted)' }}>{a}:</label>
              <input type="range" min={0} max={1} step={0.05} value={fixed[a as keyof typeof fixed]}
                onChange={e=>setFixed(prev=>({...prev,[a]:parseFloat(e.target.value)}))} style={{ width:'80px' }} />
              <span className="text-xs font-mono" style={{ color:'#3b82f6', width:'30px' }}>{fixed[a as keyof typeof fixed].toFixed(2)}</span>
            </div>
          ))}
        </div>

        <Plot
          data={viewMode==='heatmap' ? [{
            type:'heatmap',
            x:xs, y:ys, z:zScores,
            colorscale:actionColorMap,
            zmin:0, zmax:1,
            colorbar:{title:{text:'Gate Score',font:{color:'#94a3b8',size:10}},tickfont:{color:'#94a3b8',size:9},thickness:12},
            hovertemplate:`${xAxis}: %{x:.2f}<br>${yAxis}: %{y:.2f}<br>Score: %{z:.3f}<extra></extra>`,
          }] : [{
            type:'surface',
            x:xs, y:ys, z:zScores,
            colorscale:actionColorMap,
            contours:{z:{show:true,color:'rgba(255,255,255,0.2)'}},
          }]}
          layout={{
            paper_bgcolor:'transparent', plot_bgcolor:'transparent',
            margin:{t:10,l:60,r:60,b:50}, height:400,
            xaxis:{color:'#94a3b8',title:{text:xAxis,font:{color:'#94a3b8',size:11}}},
            yaxis:{color:'#94a3b8',title:{text:yAxis,font:{color:'#94a3b8',size:11}}},
            scene:viewMode==='surface'?{
              xaxis:{title:xAxis,color:'#94a3b8'},
              yaxis:{title:yAxis,color:'#94a3b8'},
              zaxis:{title:'Gate Score',color:'#94a3b8'},
              bgcolor:'transparent',
            }:undefined,
          }}
          config={{ displayModeBar: true, displaylogo:false }} style={{ width:'100%' }} />

        {/* Legend */}
        <div className="flex flex-wrap gap-3 mt-3">
          {Object.entries(ACTION_COLORS).map(([action,color])=>(
            <div key={action} className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm" style={{ background:color, display:'inline-block' }} />
              <span className="text-xs capitalize" style={{ color:'var(--text-muted)' }}>{action} (~{ACTION_CENTROIDS[action]})</span>
            </div>
          ))}
        </div>
        <p className="text-xs mt-2" style={{ color:'var(--text-muted)' }}>
          Computed from simplified Mamdani inference matching <code>mitcf_pipeline/fuzzy_gate.py</code>.
          Z axis = gate_score via centroid defuzzification.
        </p>
      </div>
    </div>
  );
}
