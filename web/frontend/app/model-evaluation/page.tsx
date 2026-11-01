'use client';
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';

const Plot = dynamic(() => import('react-plotly.js'), { ssr: false });
const API = 'http://localhost:8080';

interface ConfusionRow { algorithm: string; true_positive: number; false_positive: number; true_negative: number; false_negative: number; }
interface ModelRow { rank: number; algorithm: string; test_accuracy: number; test_f1: number; test_auc: number; test_precision: number; test_recall: number; test_log_loss: number; }

function pct(v: number) { return `${(v * 100).toFixed(1)}%`; }

export default function ModelEvaluationPage() {
  const [confusion, setConfusion] = useState<ConfusionRow[]>([]);
  const [models, setModels] = useState<ModelRow[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`${API}/api/deep-learning/confusion`).then(r => r.json()),
      fetch(`${API}/api/deep-learning/models`).then(r => r.json()),
    ]).then(([c, m]) => {
      setConfusion(c);
      setModels(m.sort((a: ModelRow, b: ModelRow) => a.rank - b.rank));
      if (c.length) setSelected(c[0].algorithm);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const row = confusion.find(r => r.algorithm === selected);
  const acc3dImages = [
    '01_05_mlp8x4_relu','02_11_mlp24_leakyrelu','03_02_mlp8_relu','04_16_deep8x8x4_relu',
    '05_06_mlp16x8_relu','06_08_mlp16_tanh','07_04_mlp24_relu','08_19_dropout16_relu',
    '09_12_mlp16_elu','10_18_wide48_relu','11_10_mlp16_leakyrelu','12_13_mlp16_swish',
    '13_03_mlp16_relu','14_09_mlp16x8_tanh','15_20_regularized24x8_relu','16_17_deep16x8x4_tanh',
    '17_07_mlp24x12_relu','18_01_logistic_sigmoid','19_14_mlp16_gelu','20_15_mlp8_softplus',
  ];

  const cmLabels = ['Predicted +', 'Predicted −'];
  const cmZ = row ? [[row.true_positive, row.false_negative], [row.false_positive, row.true_negative]] : [[0,0],[0,0]];
  const cmText = row ? [
    [`TP: ${row.true_positive}`, `FN: ${row.false_negative}`],
    [`FP: ${row.false_positive}`, `TN: ${row.true_negative}`],
  ] : [['',''],['','']];

  const modelAcc = models.map(m => m.algorithm.replace(/^\d+_/, ''));
  const accColors = models.map(m => m.test_accuracy >= 0.8 ? '#22c55e' : m.test_accuracy >= 0.6 ? '#f59e0b' : '#ef4444');

  if (loading) return <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading evaluation data...</div>;

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Model Evaluation</h2>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
          Confusion matrices and accuracy comparison for all {confusion.length} neural network variants
        </p>
      </div>

      {/* Accuracy comparison bar */}
      <div className="kpi-card mb-6">
        <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Test Accuracy — All 20 Models</h3>
        <Plot
          data={[{
            type: 'bar', x: modelAcc, y: models.map(m => m.test_accuracy),
            marker: { color: accColors }, text: models.map(m => pct(m.test_accuracy)),
            textposition: 'outside', textfont: { size: 9, color: '#94a3b8' },
          }]}
          layout={{
            paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
            margin: { t: 10, l: 50, r: 10, b: 100 },
            xaxis: { color: '#94a3b8', tickangle: -45, tickfont: { size: 9 } },
            yaxis: { color: '#94a3b8', range: [0, 1.15], title: { text: 'Test Accuracy', font: { color: '#94a3b8', size: 11 } } },
            height: 280, shapes: [{ type: 'line', x0: -0.5, x1: 19.5, y0: 0.8, y1: 0.8, line: { color: '#22c55e', dash: 'dash', width: 1 } }],
          }}
          config={{ displayModeBar: true, displaylogo: false }} style={{ width: '100%' }} />
      </div>

      {/* Confusion matrix */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="kpi-card">
          <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Confusion Matrix</h3>
          <div className="mb-3">
            <label className="text-xs mr-2" style={{ color: 'var(--text-muted)' }}>Select model:</label>
            <select value={selected} onChange={e => setSelected(e.target.value)}
              className="text-xs px-2 py-1 rounded" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
              {confusion.map(r => <option key={r.algorithm} value={r.algorithm}>{r.algorithm}</option>)}
            </select>
          </div>
          {row && (
            <Plot
              data={[{
                type: 'heatmap', z: cmZ, x: cmLabels, y: ['Actual +', 'Actual −'],
                text: cmText, texttemplate: '%{text}', textfont: { size: 14, color: '#fff' },
                colorscale: [[0,'#1e3a5f'],[1,'#3b82f6']], showscale: false,
              }]}
              layout={{
                paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
                margin: { t: 10, l: 70, r: 10, b: 50 },
                xaxis: { color: '#94a3b8', side: 'bottom' },
                yaxis: { color: '#94a3b8', autorange: 'reversed' },
                height: 240, annotations: [
                  { x: 0.5, y: -0.2, xref: 'paper', yref: 'paper', text: `${selected}`, showarrow: false, font: { size: 10, color: '#64748b' } },
                ],
              }}
              config={{ displayModeBar: false }} style={{ width: '100%' }} />
          )}
          {row && (
            <div className="grid grid-cols-2 gap-2 mt-3">
              {[
                { label: 'Precision', val: row.true_positive / Math.max(1, row.true_positive + row.false_positive), good: true },
                { label: 'Recall', val: row.true_positive / Math.max(1, row.true_positive + row.false_negative), good: true },
                { label: 'Specificity', val: row.true_negative / Math.max(1, row.true_negative + row.false_positive), good: true },
                { label: 'F1', val: 2*row.true_positive / Math.max(1, 2*row.true_positive + row.false_positive + row.false_negative), good: true },
              ].map(({ label, val }) => (
                <div key={label} className="p-2 rounded text-center" style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.15)' }}>
                  <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</div>
                  <div className="text-base font-bold" style={{ color: val >= 0.7 ? '#22c55e' : '#f59e0b' }}>{pct(val)}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Metrics radar-style table for selected model */}
        <div className="kpi-card">
          <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Performance Metrics — Selected Model</h3>
          {(() => {
            const m = models.find(x => x.algorithm === selected);
            if (!m) return null;
            const metrics = [
              { label: 'Test Accuracy', val: m.test_accuracy },
              { label: 'Test Precision', val: m.test_precision },
              { label: 'Test Recall', val: m.test_recall },
              { label: 'Test F1', val: m.test_f1 },
              { label: 'Test AUC', val: m.test_auc },
            ];
            return (
              <div className="space-y-3">
                {metrics.map(({ label, val }) => (
                  <div key={label}>
                    <div className="flex justify-between text-xs mb-1">
                      <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
                      <span style={{ color: val >= 0.7 ? '#22c55e' : '#f59e0b', fontWeight: 600 }}>{pct(val)}</span>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
                      <div className="h-full rounded-full" style={{ width: `${val * 100}%`, background: val >= 0.7 ? '#22c55e' : '#f59e0b' }} />
                    </div>
                  </div>
                ))}
                <div className="pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
                  <div className="flex justify-between text-xs">
                    <span style={{ color: 'var(--text-muted)' }}>Log Loss</span>
                    <span className="font-mono" style={{ color: 'var(--text-secondary)' }}>{m.test_log_loss.toFixed(4)}</span>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* 3D accuracy PNG gallery */}
      <div className="kpi-card">
        <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
          3D Accuracy Surface Gallery — Training / Validation / Test Space
        </h3>
        <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
          Each chart shows accuracy across the hyperparameter sweep for one model variant. Generated by the MITCF deep training module.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {acc3dImages.map((name) => (
            <div key={name} className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
              <img
                src={`http://localhost:8080/graph/accuracy_3d/${name}_accuracy_3d.png`}
                alt={name}
                className="w-full"
                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
              <div className="p-1.5 text-center">
                <span className="text-xs" style={{ color: 'var(--text-muted)', fontSize: '10px' }}>{name.replace(/_/g, ' ')}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
