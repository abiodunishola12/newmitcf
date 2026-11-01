'use client';
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';

const Plot = dynamic(() => import('react-plotly.js'), { ssr: false });
const API = 'http://localhost:8080';

interface ModelRow {
  rank: number; algorithm: string; activation: string; hidden_layers: string;
  learning_rate: number; l2: number; dropout: number; epochs: number; parameters: number;
  test_accuracy: number; test_f1: number; test_auc: number;
}

const ACT_COLORS: Record<string, string> = {
  relu:'#3b82f6', leaky_relu:'#6366f1', tanh:'#f59e0b', sigmoid:'#ef4444',
  elu:'#22c55e', swish:'#a855f7', gelu:'#f97316', softplus:'#06b6d4',
};

export default function HyperparametersPage() {
  const [models, setModels] = useState<ModelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [colorBy, setColorBy] = useState<'activation'|'rank'>('activation');

  useEffect(() => {
    fetch(`${API}/api/deep-learning/models`).then(r=>r.json()).then((m:ModelRow[]) => {
      setModels(m.sort((a,b)=>a.rank-b.rank));
      setLoading(false);
    }).catch(()=>setLoading(false));
  }, []);

  const lrUniq = Array.from(new Set(models.map(m=>m.learning_rate))).sort((a,b)=>a-b);
  const l2Uniq = Array.from(new Set(models.map(m=>m.l2))).sort((a,b)=>a-b);

  function lrGroup() {
    return lrUniq.map(lr=>{
      const group = models.filter(m=>m.learning_rate===lr);
      return { lr, avg_acc: group.reduce((s,m)=>s+m.test_accuracy,0)/group.length, count:group.length };
    });
  }
  function l2Group() {
    return l2Uniq.map(l2=>{
      const group = models.filter(m=>m.l2===l2);
      return { l2, avg_acc: group.reduce((s,m)=>s+m.test_accuracy,0)/group.length, count:group.length };
    });
  }

  if (loading) return <div className="text-sm" style={{ color:'var(--text-muted)' }}>Loading hyperparameter data...</div>;

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold" style={{ color:'var(--text-primary)' }}>Hyperparameters</h2>
        <p className="text-sm mt-1" style={{ color:'var(--text-muted)' }}>
          Hyperparameter sweep analysis across all 20 neural network configurations.
        </p>
      </div>

      {/* Scatter: LR vs accuracy */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="kpi-card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold" style={{ color:'var(--text-primary)' }}>Learning Rate vs Test Accuracy</h3>
            <select value={colorBy} onChange={e=>setColorBy(e.target.value as 'activation'|'rank')} className="text-xs px-2 py-1 rounded" style={{ background:'var(--bg-card)', border:'1px solid var(--border)', color:'var(--text-primary)' }}>
              <option value="activation">Color by activation</option>
              <option value="rank">Color by rank</option>
            </select>
          </div>
          <Plot
            data={colorBy==='activation'
              ? Object.entries(ACT_COLORS).map(([act, color]) => {
                  const grp = models.filter(m=>m.activation===act);
                  return {
                    type:'scatter' as const, mode:'markers' as const, name:act,
                    x:grp.map(m=>m.learning_rate), y:grp.map(m=>m.test_accuracy),
                    marker:{color, size:10, symbol:'circle'},
                    text:grp.map(m=>m.algorithm), hovertemplate:'%{text}<br>LR: %{x}<br>Acc: %{y:.3f}<extra></extra>',
                  };
                })
              : [{
                  type:'scatter' as const, mode:'markers' as const, showlegend:false,
                  x:models.map(m=>m.learning_rate), y:models.map(m=>m.test_accuracy),
                  marker:{ color:models.map(m=>m.rank), colorscale:'Viridis', size:10, showscale:true, colorbar:{tickfont:{color:'#94a3b8',size:9},thickness:10} },
                  text:models.map(m=>m.algorithm), hovertemplate:'%{text}<br>Rank: %{marker.color}<br>LR: %{x}<br>Acc: %{y:.3f}<extra></extra>',
                }]
            }
            layout={{
              paper_bgcolor:'transparent', plot_bgcolor:'transparent',
              margin:{t:10,l:55,r:10,b:50}, height:280,
              xaxis:{color:'#94a3b8',type:'log',title:{text:'Learning Rate (log)',font:{color:'#94a3b8',size:11}}},
              yaxis:{color:'#94a3b8',range:[0,1.1],title:{text:'Test Accuracy',font:{color:'#94a3b8',size:11}}},
              legend:{font:{color:'#94a3b8',size:9},bgcolor:'transparent',x:1.01,xanchor:'left'},
            }}
            config={{ displayModeBar: false }} style={{ width:'100%' }} />
        </div>

        <div className="kpi-card">
          <h3 className="text-sm font-semibold mb-3" style={{ color:'var(--text-primary)' }}>Parameter Count vs Test Accuracy</h3>
          <Plot
            data={[{
              type:'scatter' as const, mode:'markers' as const, showlegend:false,
              x:models.map(m=>m.parameters), y:models.map(m=>m.test_accuracy),
              marker:{
                color:models.map(m=>ACT_COLORS[m.activation]??'#64748b'), size:10,
                line:{color:models.map(m=>m.test_accuracy>=0.8?'#22c55e':'transparent'),width:2},
              },
              text:models.map(m=>m.algorithm), hovertemplate:'%{text}<br>Params: %{x}<br>Acc: %{y:.3f}<extra></extra>',
            }]}
            layout={{
              paper_bgcolor:'transparent', plot_bgcolor:'transparent',
              margin:{t:10,l:55,r:10,b:50}, height:280,
              xaxis:{color:'#94a3b8',title:{text:'Parameter Count',font:{color:'#94a3b8',size:11}}},
              yaxis:{color:'#94a3b8',range:[0,1.1],title:{text:'Test Accuracy',font:{color:'#94a3b8',size:11}}},
            }}
            config={{ displayModeBar: false }} style={{ width:'100%' }} />
        </div>
      </div>

      {/* LR group average */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="kpi-card">
          <h3 className="text-sm font-semibold mb-3" style={{ color:'var(--text-primary)' }}>Average Accuracy by Learning Rate</h3>
          {(() => {
            const grps = lrGroup();
            return (
              <table className="data-table">
                <thead><tr><th>Learning Rate</th><th>Model Count</th><th>Avg Test Acc</th></tr></thead>
                <tbody>
                  {grps.map(g=>(
                    <tr key={g.lr}>
                      <td className="font-mono text-xs">{g.lr}</td>
                      <td>{g.count}</td>
                      <td style={{ color:g.avg_acc>=0.7?'#22c55e':'#f59e0b', fontWeight:600 }}>{(g.avg_acc*100).toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            );
          })()}
        </div>

        <div className="kpi-card">
          <h3 className="text-sm font-semibold mb-3" style={{ color:'var(--text-primary)' }}>Average Accuracy by L2 Regularization</h3>
          {(() => {
            const grps = l2Group();
            return (
              <table className="data-table">
                <thead><tr><th>L2 λ</th><th>Model Count</th><th>Avg Test Acc</th></tr></thead>
                <tbody>
                  {grps.map(g=>(
                    <tr key={g.l2}>
                      <td className="font-mono text-xs">{g.l2}</td>
                      <td>{g.count}</td>
                      <td style={{ color:g.avg_acc>=0.7?'#22c55e':'#f59e0b', fontWeight:600 }}>{(g.avg_acc*100).toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            );
          })()}
        </div>
      </div>

      {/* Activation summary */}
      <div className="kpi-card">
        <h3 className="text-sm font-semibold mb-3" style={{ color:'var(--text-primary)' }}>Accuracy by Activation Function</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Object.entries(ACT_COLORS).map(([act, color]) => {
            const grp = models.filter(m=>m.activation===act);
            if (!grp.length) return null;
            const avgAcc = grp.reduce((s,m)=>s+m.test_accuracy,0)/grp.length;
            const best = Math.max(...grp.map(m=>m.test_accuracy));
            return (
              <div key={act} className="p-3 rounded text-center" style={{ background:`${color}12`, border:`1px solid ${color}40` }}>
                <div className="text-xs font-bold" style={{ color }}>{act}</div>
                <div className="text-xs mt-1" style={{ color:'var(--text-muted)' }}>{grp.length} model{grp.length>1?'s':''}</div>
                <div className="text-lg font-bold mt-1" style={{ color }}>{(avgAcc*100).toFixed(1)}%</div>
                <div className="text-xs" style={{ color:'var(--text-muted)', fontSize:'10px' }}>avg acc</div>
                <div className="text-xs" style={{ color }}>{(best*100).toFixed(1)}% best</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
