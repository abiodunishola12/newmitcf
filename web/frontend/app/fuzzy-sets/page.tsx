'use client';
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';

const Plot = dynamic(() => import('react-plotly.js'), { ssr: false });
const API = 'http://localhost:8080';

interface ActionMembRow { algorithm: string; accept_membership: number; verify_membership: number; revise_membership: number; escalate_membership: number; refuse_membership: number; }
interface ActionDist { decision_action: string; count: number; proportion: number; }

const ACTIONS = ['accept','verify','revise','escalate','refuse'];
const ACOLORS: Record<string, string> = { accept:'#22c55e', verify:'#3b82f6', revise:'#f59e0b', escalate:'#f97316', refuse:'#ef4444' };

export default function FuzzySetsPage() {
  const [memberships, setMemberships] = useState<ActionMembRow[]>([]);
  const [dist, setDist] = useState<ActionDist[]>([]);
  const [manifest, setManifest] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`${API}/api/fuzzy/gate-results`).then(r=>r.json()),
      fetch(`${API}/api/fuzzy/action-distribution`).then(r=>r.json()),
      fetch(`${API}/api/fuzzy/manifest`).then(r=>r.json()),
    ]).then(([m, d, mf]) => { setMemberships(m); setDist(d); setManifest(mf); setLoading(false); }).catch(()=>setLoading(false));
  }, []);

  const algos = memberships.map(r=>r.algorithm.replace(/^\d+_/,''));

  if (loading) return <div className="text-sm" style={{ color:'var(--text-muted)' }}>Loading fuzzy sets...</div>;

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold" style={{ color:'var(--text-primary)' }}>Fuzzy Sets</h2>
        <p className="text-sm mt-1" style={{ color:'var(--text-muted)' }}>
          Output action membership degrees for each algorithm and aggregate action distribution across all 20 models.
        </p>
      </div>

      {/* System info */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          ['Input Variables', '5 (quality, safety, risk, uncertainty, efficiency)'],
          ['Membership Sets', '3 per input (low, medium, high)'],
          ['Fuzzy Rules', '15 Mamdani IF-THEN'],
          ['Output Actions', '5 (accept, verify, revise, escalate, refuse)'],
        ].map(([k, v]) => (
          <div key={k} className="kpi-card p-3">
            <div className="text-xs" style={{ color:'var(--text-muted)', fontSize:'10px' }}>{k}</div>
            <div className="text-xs font-semibold mt-1" style={{ color:'var(--text-primary)' }}>{v}</div>
          </div>
        ))}
      </div>

      {/* Action distribution pie */}
      {dist.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <div className="kpi-card">
            <h3 className="text-sm font-semibold mb-3" style={{ color:'var(--text-primary)' }}>Action Distribution (20 algorithms)</h3>
            <Plot
              data={[{
                type: 'pie', hole: 0.4,
                labels: dist.map(d=>d.decision_action.toUpperCase()),
                values: dist.map(d=>d.count),
                marker: { colors: dist.map(d=>ACOLORS[d.decision_action]??'#64748b') },
                textinfo: 'label+percent', textfont: { size: 11, color: '#fff' },
                hovertemplate: '%{label}<br>Count: %{value}<br>%{percent}<extra></extra>',
              }]}
              layout={{
                paper_bgcolor:'transparent', plot_bgcolor:'transparent',
                margin:{t:10,l:10,r:10,b:10}, height:280,
                legend: { font:{color:'#94a3b8',size:10}, bgcolor:'transparent' },
              }}
              config={{ displayModeBar: false }} style={{ width:'100%' }} />
          </div>

          {/* Membership heatmap */}
          <div className="kpi-card">
            <h3 className="text-sm font-semibold mb-3" style={{ color:'var(--text-primary)' }}>Action Membership Degrees — All Models</h3>
            <Plot
              data={[{
                type:'heatmap',
                x: ACTIONS,
                y: algos,
                z: memberships.map(r=>[r.accept_membership,r.verify_membership,r.revise_membership,r.escalate_membership,r.refuse_membership]),
                colorscale: [[0,'#1e2d3d'],[0.5,'#3b82f6'],[1,'#22c55e']],
                showscale: true, colorbar:{ tickfont:{color:'#94a3b8',size:10}, thickness:12 },
                hovertemplate:'%{y}<br>%{x}: %{z:.3f}<extra></extra>',
              }]}
              layout={{
                paper_bgcolor:'transparent', plot_bgcolor:'transparent',
                margin:{t:10,l:140,r:50,b:40}, height:280,
                xaxis:{color:'#94a3b8'}, yaxis:{color:'#94a3b8',tickfont:{size:9}},
              }}
              config={{ displayModeBar: false }} style={{ width:'100%' }} />
          </div>
        </div>
      )}

      {/* Action membership bar stacked */}
      {memberships.length > 0 && (
        <div className="kpi-card mb-6">
          <h3 className="text-sm font-semibold mb-3" style={{ color:'var(--text-primary)' }}>Stacked Action Memberships — All Algorithms</h3>
          <Plot
            data={ACTIONS.map(a=>({
              type:'bar' as const, name:a.toUpperCase(),
              x: algos,
              y: memberships.map(r=>{
                const v = r[`${a}_membership` as keyof ActionMembRow] as number;
                return isNaN(v)?0:v;
              }),
              marker:{color:ACOLORS[a]},
            }))}
            layout={{
              barmode:'stack' as const, paper_bgcolor:'transparent', plot_bgcolor:'transparent',
              margin:{t:10,l:45,r:10,b:90}, height:280,
              xaxis:{color:'#94a3b8',tickangle:-45,tickfont:{size:9}},
              yaxis:{color:'#94a3b8',title:{text:'Membership (stacked)',font:{color:'#94a3b8',size:11}}},
              legend:{font:{color:'#94a3b8',size:10},bgcolor:'transparent',orientation:'h' as const,y:-0.35},
            }}
            config={{ displayModeBar: true, displaylogo:false }} style={{ width:'100%' }} />
        </div>
      )}

      {/* Manifest info */}
      {Object.keys(manifest).length > 0 && (
        <div className="kpi-card" style={{ borderLeft:'3px solid #a855f7' }}>
          <h3 className="text-sm font-semibold mb-3" style={{ color:'var(--text-primary)' }}>Fuzzy Gate Manifest</h3>
          <pre className="text-xs p-3 rounded overflow-auto" style={{ background:'rgba(0,0,0,0.3)', color:'#93c5fd', maxHeight:'200px' }}>
            {JSON.stringify(manifest, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
