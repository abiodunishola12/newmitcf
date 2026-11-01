'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';

const Plot = dynamic(() => import('react-plotly.js'), { ssr: false });
const API = 'http://localhost:8080';

interface ModelRow {
  rank: number; algorithm: string; hidden_layers: string; activation: string;
  learning_rate: number; l2: number; dropout: number; epochs: number; parameters: number;
  test_accuracy: number; test_f1: number; test_auc: number; test_log_loss: number;
  validation_accuracy: number; train_accuracy: number;
}

function pct(v: number) { return `${(v * 100).toFixed(1)}%`; }

export default function DeepLearningPage() {
  const [models, setModels] = useState<ModelRow[]>([]);
  const [history, setHistory] = useState<Record<string, Array<{ epoch: number; validation_loss: number; validation_accuracy: number }>>>({});
  const [loading, setLoading] = useState(true);
  const [selectedAlgo, setSelectedAlgo] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch(`${API}/api/deep-learning/models`).then((r) => r.json()),
      fetch(`${API}/api/deep-learning/history/all?n=10`).then((r) => r.json()),
    ]).then(([m, h]) => {
      setModels(m);
      setHistory(h);
      if (m.length) setSelectedAlgo(m[0].algorithm);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const activationBadgeColor: Record<string, string> = {
    relu: '#3b82f6', leaky_relu: '#6366f1', tanh: '#f59e0b', sigmoid: '#ef4444',
    elu: '#22c55e', swish: '#a855f7', gelu: '#f97316', softplus: '#06b6d4',
  };

  const sortedByRank = [...models].sort((a, b) => a.rank - b.rank);

  const lossTraces = Object.entries(history).map(([algo, pts]) => ({
    type: 'scatter' as const, mode: 'lines' as const,
    name: algo.replace(/^\d+_/, ''),
    x: pts.map((p) => p.epoch),
    y: pts.map((p) => p.validation_loss),
    line: { width: 1.5 },
  }));

  const accTraces = Object.entries(history).map(([algo, pts]) => ({
    type: 'scatter' as const, mode: 'lines' as const,
    name: algo.replace(/^\d+_/, ''),
    x: pts.map((p) => p.epoch),
    y: pts.map((p) => p.validation_accuracy),
    line: { width: 1.5 },
  }));

  const plotLayout = {
    paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
    margin: { t: 10, l: 50, r: 10, b: 40 },
    xaxis: { color: '#94a3b8', title: { text: 'Epoch', font: { color: '#94a3b8', size: 11 } } },
    yaxis: { color: '#94a3b8' },
    legend: { font: { color: '#94a3b8', size: 10 }, bgcolor: 'transparent', x: 1.01, xanchor: 'left' },
    font: { color: '#94a3b8', size: 11 },
    height: 320,
    showlegend: true,
  };

  if (loading) return <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading model data...</div>;

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Deep Learning Models</h2>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
          {models.length} neural network variants trained on the MITCF trustworthiness classification task
        </p>
      </div>

      {/* Training Curves */}
      {Object.keys(history).length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <div className="kpi-card">
            <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
              Validation Loss Curves â€” Top 10 Models
            </h3>
            <Plot data={lossTraces} layout={{ ...plotLayout, yaxis: { ...plotLayout.yaxis, title: { text: 'Validation Loss', font: { color: '#94a3b8', size: 11 } } } }}
              config={{ displayModeBar: true, displaylogo: false }} style={{ width: '100%' }} />
          </div>
          <div className="kpi-card">
            <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
              Validation Accuracy Curves â€” Top 10 Models
            </h3>
            <Plot data={accTraces} layout={{ ...plotLayout, yaxis: { ...plotLayout.yaxis, range: [0, 1.05], title: { text: 'Validation Accuracy', font: { color: '#94a3b8', size: 11 } } } }}
              config={{ displayModeBar: true, displaylogo: false }} style={{ width: '100%' }} />
          </div>
        </div>
      )}

      {/* Model Table */}
      <div className="kpi-card">
        <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
          Model Performance Ranking
        </h3>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Algorithm</th>
                <th>Hidden Layers</th>
                <th>Activation</th>
                <th>LR</th>
                <th>L2</th>
                <th>Dropout</th>
                <th>Params</th>
                <th>Train Acc</th>
                <th>Val Acc</th>
                <th>Test Acc</th>
                <th>Test F1</th>
                <th>Test AUC</th>
                <th>Log Loss</th>
              </tr>
            </thead>
            <tbody>
              {sortedByRank.map((m) => (
                <tr key={m.algorithm} onClick={() => setSelectedAlgo(m.algorithm)}
                  style={{ cursor: 'pointer', background: selectedAlgo === m.algorithm ? 'rgba(59,130,246,0.08)' : undefined }}>
                  <td><span className="font-bold" style={{ color: 'var(--accent)' }}>#{m.rank}</span></td>
                  <td><span className="font-mono text-xs">{m.algorithm}</span></td>
                  <td><span className="font-mono text-xs">{m.hidden_layers}</span></td>
                  <td>
                    <span className="badge" style={{
                      background: `${activationBadgeColor[m.activation] ?? '#64748b'}22`,
                      color: activationBadgeColor[m.activation] ?? '#64748b',
                    }}>
                      {m.activation}
                    </span>
                  </td>
                  <td className="font-mono text-xs">{m.learning_rate}</td>
                  <td className="font-mono text-xs">{m.l2}</td>
                  <td className="font-mono text-xs">{m.dropout}</td>
                  <td className="font-mono text-xs">{m.parameters.toLocaleString()}</td>
                  <td>{pct(m.train_accuracy)}</td>
                  <td>{pct(m.validation_accuracy)}</td>
                  <td style={{ color: m.test_accuracy >= 0.8 ? 'var(--success)' : 'var(--warning)', fontWeight: 600 }}>{pct(m.test_accuracy)}</td>
                  <td>{pct(m.test_f1)}</td>
                  <td>{m.test_auc.toFixed(4)}</td>
                  <td>{m.test_log_loss.toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs mt-3" style={{ color: 'var(--text-muted)' }}>
          Click a row to highlight. All models trained on {models[0]?.parameters ? `64-dimensional hashing features` : 'â€”'}.
          Ranking criterion: test F1 â†’ AUC â†’ accuracy â†’ log loss.
        </p>
      </div>
    </div>
  );
}
