'use client';
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';

const Plot = dynamic(() => import('react-plotly.js'), { ssr: false });
const API = 'http://localhost:8080';

interface ModelRow {
  rank: number; algorithm: string; hidden_layers: string; activation: string;
  learning_rate: number; l2: number; dropout: number; epochs: number; parameters: number;
  train_accuracy: number; validation_accuracy: number; test_accuracy: number;
  test_precision: number; test_recall: number; test_f1: number; test_auc: number; test_log_loss: number;
}
interface HistPt { epoch: number; validation_loss: number; validation_accuracy: number; }

function pct(v: number) { return `${(v * 100).toFixed(1)}%`; }

export default function ModelComparisonPage() {
  const [models, setModels] = useState<ModelRow[]>([]);
  const [history, setHistory] = useState<Record<string, HistPt[]>>({});
  const [selA, setSelA] = useState('');
  const [selB, setSelB] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`${API}/api/deep-learning/models`).then(r => r.json()),
      fetch(`${API}/api/deep-learning/history/all?n=20`).then(r => r.json()),
    ]).then(([m, h]) => {
      const sorted = m.sort((a: ModelRow, b: ModelRow) => a.rank - b.rank);
      setModels(sorted);
      setHistory(h);
      if (sorted.length >= 2) { setSelA(sorted[0].algorithm); setSelB(sorted[1].algorithm); }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const mA = models.find(m => m.algorithm === selA);
  const mB = models.find(m => m.algorithm === selB);
  const hA = history[selA] ?? [];
  const hB = history[selB] ?? [];

  const metrics = ['test_accuracy','test_precision','test_recall','test_f1','test_auc'] as const;
  const metricLabels = ['Accuracy','Precision','Recall','F1','AUC'];

  const radarData = mA && mB ? [
    {
      type: 'scatterpolar' as const, fill: 'toself', fillcolor: 'rgba(59,130,246,0.15)',
      line: { color: '#3b82f6' }, name: selA.replace(/^\d+_/, ''),
      r: metrics.map(k => mA[k] as number), theta: metricLabels,
    },
    {
      type: 'scatterpolar' as const, fill: 'toself', fillcolor: 'rgba(168,85,247,0.15)',
      line: { color: '#a855f7' }, name: selB.replace(/^\d+_/, ''),
      r: metrics.map(k => mB[k] as number), theta: metricLabels,
    },
  ] : [];

  const plotLayout = {
    paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
    margin: { t: 10, l: 50, r: 10, b: 40 },
    xaxis: { color: '#94a3b8', title: { text: 'Epoch', font: { color: '#94a3b8', size: 11 } } },
    yaxis: { color: '#94a3b8' },
    legend: { font: { color: '#94a3b8', size: 10 }, bgcolor: 'transparent' },
    height: 260,
  };

  if (loading) return <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading models...</div>;

  function sel(v: string, which: 'A' | 'B') {
    if (which === 'A') setSelA(v); else setSelB(v);
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Model Comparison</h2>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Side-by-side comparison of any two neural network variants</p>
      </div>

      {/* selectors */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        {(['A','B'] as const).map(which => {
          const val = which === 'A' ? selA : selB;
          const color = which === 'A' ? '#3b82f6' : '#a855f7';
          return (
            <div key={which} className="kpi-card" style={{ borderTop: `2px solid ${color}` }}>
              <div className="text-xs font-semibold mb-2" style={{ color }}>Model {which}</div>
              <select value={val} onChange={e => sel(e.target.value, which)}
                className="w-full text-xs px-2 py-1 rounded" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
                {models.map(m => <option key={m.algorithm} value={m.algorithm}>{m.algorithm}</option>)}
              </select>
              {(which === 'A' ? mA : mB) && (() => {
                const m = (which === 'A' ? mA : mB)!;
                return (
                  <div className="grid grid-cols-3 gap-2 mt-3">
                    {[['Test Acc', pct(m.test_accuracy)],['F1', pct(m.test_f1)],['AUC', m.test_auc.toFixed(3)],
                      ['Params', m.parameters.toLocaleString()],['Epochs', m.epochs],['LR', m.learning_rate]].map(([k, v]) => (
                      <div key={k as string} className="text-center p-1.5 rounded" style={{ background: 'rgba(255,255,255,0.03)' }}>
                        <div className="text-xs" style={{ color: 'var(--text-muted)', fontSize:'10px' }}>{k}</div>
                        <div className="text-xs font-bold" style={{ color }}>{v}</div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          );
        })}
      </div>

      {/* Radar chart */}
      {mA && mB && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <div className="kpi-card">
            <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Metric Radar</h3>
            <Plot
              data={radarData}
              layout={{
                paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
                polar: { bgcolor: 'transparent', radialaxis: { color: '#475569', gridcolor: '#334155', range: [0,1] }, angularaxis: { color: '#94a3b8' } },
                legend: { font: { color: '#94a3b8', size: 10 }, bgcolor: 'transparent' },
                margin: { t: 10, l: 10, r: 10, b: 10 }, height: 280,
              }}
              config={{ displayModeBar: false }} style={{ width: '100%' }} />
          </div>

          {/* Metric bar comparison */}
          <div className="kpi-card">
            <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Metric Comparison</h3>
            <Plot
              data={[
                { type: 'bar', name: selA.replace(/^\d+_/,''), x: metricLabels, y: metrics.map(k => mA[k] as number), marker: { color: '#3b82f6' } },
                { type: 'bar', name: selB.replace(/^\d+_/,''), x: metricLabels, y: metrics.map(k => mB[k] as number), marker: { color: '#a855f7' } },
              ]}
              layout={{
                barmode: 'group', paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
                margin: { t: 10, l: 45, r: 10, b: 50 }, height: 280,
                xaxis: { color: '#94a3b8' }, yaxis: { color: '#94a3b8', range: [0, 1.1] },
                legend: { font: { color: '#94a3b8', size: 10 }, bgcolor: 'transparent' },
              }}
              config={{ displayModeBar: false }} style={{ width: '100%' }} />
          </div>
        </div>
      )}

      {/* Training curves comparison */}
      {(hA.length > 0 || hB.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="kpi-card">
            <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Validation Loss Curves</h3>
            <Plot
              data={[
                ...(hA.length ? [{ type: 'scatter' as const, mode: 'lines' as const, name: selA.replace(/^\d+_/,''), x: hA.map(p=>p.epoch), y: hA.map(p=>p.validation_loss), line:{color:'#3b82f6'} }] : []),
                ...(hB.length ? [{ type: 'scatter' as const, mode: 'lines' as const, name: selB.replace(/^\d+_/,''), x: hB.map(p=>p.epoch), y: hB.map(p=>p.validation_loss), line:{color:'#a855f7'} }] : []),
              ]}
              layout={{ ...plotLayout, yaxis: { ...plotLayout.yaxis, title: { text: 'Validation Loss', font: { color: '#94a3b8', size: 11 } } } }}
              config={{ displayModeBar: false }} style={{ width: '100%' }} />
          </div>
          <div className="kpi-card">
            <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Validation Accuracy Curves</h3>
            <Plot
              data={[
                ...(hA.length ? [{ type: 'scatter' as const, mode: 'lines' as const, name: selA.replace(/^\d+_/,''), x: hA.map(p=>p.epoch), y: hA.map(p=>p.validation_accuracy), line:{color:'#3b82f6'} }] : []),
                ...(hB.length ? [{ type: 'scatter' as const, mode: 'lines' as const, name: selB.replace(/^\d+_/,''), x: hB.map(p=>p.epoch), y: hB.map(p=>p.validation_accuracy), line:{color:'#a855f7'} }] : []),
              ]}
              layout={{ ...plotLayout, yaxis: { ...plotLayout.yaxis, range:[0,1.05], title: { text: 'Validation Accuracy', font: { color: '#94a3b8', size: 11 } } } }}
              config={{ displayModeBar: false }} style={{ width: '100%' }} />
          </div>
        </div>
      )}

      {/* Hyperparameter delta table */}
      {mA && mB && (
        <div className="kpi-card mt-6">
          <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Hyperparameter Delta</h3>
          <table className="data-table">
            <thead><tr><th>Parameter</th><th style={{color:'#3b82f6'}}>{selA.replace(/^\d+_/,'')}</th><th style={{color:'#a855f7'}}>{selB.replace(/^\d+_/,'')}</th><th>Δ (B−A)</th></tr></thead>
            <tbody>
              {([['Hidden Layers', mA.hidden_layers, mB.hidden_layers, null],
                ['Activation', mA.activation, mB.activation, null],
                ['Learning Rate', mA.learning_rate, mB.learning_rate, mB.learning_rate - mA.learning_rate],
                ['L2', mA.l2, mB.l2, mB.l2 - mA.l2],
                ['Dropout', mA.dropout, mB.dropout, mB.dropout - mA.dropout],
                ['Epochs', mA.epochs, mB.epochs, mB.epochs - mA.epochs],
                ['Parameters', mA.parameters, mB.parameters, mB.parameters - mA.parameters],
              ] as [string, number|string, number|string, number|null][]).map(([k, a, b, d]) => (
                <tr key={k as string}>
                  <td>{k}</td>
                  <td style={{ color: '#3b82f6' }}>{typeof a === 'number' ? (Number.isInteger(a) ? a : a.toFixed(4)) : a}</td>
                  <td style={{ color: '#a855f7' }}>{typeof b === 'number' ? (Number.isInteger(b) ? b : b.toFixed(4)) : b}</td>
                  <td style={{ color: d === null ? 'var(--text-muted)' : (d as number) > 0 ? '#22c55e' : (d as number) < 0 ? '#ef4444' : 'var(--text-muted)' }}>
                    {d === null ? '—' : (d as number) === 0 ? '=' : (d as number) > 0 ? `+${(d as number)}` : `${(d as number)}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
