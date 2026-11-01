'use client';
import { useEffect, useState } from 'react';
const API = 'http://localhost:8080';

interface ModelRow {
  rank: number; algorithm: string; hidden_layers: string; activation: string;
  learning_rate: number; l2: number; dropout: number; epochs: number; parameters: number;
  train_examples: number; validation_examples: number; test_examples: number;
  test_accuracy: number; test_f1: number; test_auc: number;
}
interface Manifest { algorithm_count: number; example_count: number; feature_dimensions: number; input_path: string; seed: number; splits: { train: number; validation: number; test: number }; positive_examples: number; negative_examples: number; }

const ACT_COLORS: Record<string, string> = {
  relu:'#3b82f6', leaky_relu:'#6366f1', tanh:'#f59e0b', sigmoid:'#ef4444',
  elu:'#22c55e', swish:'#a855f7', gelu:'#f97316', softplus:'#06b6d4',
};

export default function TrainingConfigPage() {
  const [models, setModels] = useState<ModelRow[]>([]);
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`${API}/api/deep-learning/models`).then(r=>r.json()),
      fetch(`${API}/api/deep-learning/manifest`).then(r=>r.json()),
    ]).then(([m, mf]) => {
      setModels(m.sort((a: ModelRow, b: ModelRow) => a.rank - b.rank));
      setManifest(mf);
      setLoading(false);
    }).catch(()=>setLoading(false));
  }, []);

  const actGroups = models.reduce((acc, m) => {
    acc[m.activation] = (acc[m.activation] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  if (loading) return <div className="text-sm" style={{ color:'var(--text-muted)' }}>Loading training config...</div>;

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold" style={{ color:'var(--text-primary)' }}>Training Configuration</h2>
        <p className="text-sm mt-1" style={{ color:'var(--text-muted)' }}>
          Hyperparameter grid for all 20 neural network variants. Configurations from <code>mitcf_pipeline/deep_training.py</code>.
        </p>
      </div>

      {/* Manifest summary */}
      {manifest && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            ['Dataset', manifest.input_path.split('/').pop()!],
            ['Total Examples', manifest.example_count],
            ['Feature Dims', manifest.feature_dimensions],
            ['Random Seed', manifest.seed],
            ['Train Split', manifest.splits.train],
            ['Val Split', manifest.splits.validation],
            ['Test Split', manifest.splits.test],
            ['Algorithms', manifest.algorithm_count],
          ].map(([k, v]) => (
            <div key={k as string} className="kpi-card p-3">
              <div className="text-xs" style={{ color:'var(--text-muted)', fontSize:'10px' }}>{k}</div>
              <div className="text-sm font-bold mt-0.5" style={{ color:'var(--accent)' }}>{v}</div>
            </div>
          ))}
        </div>
      )}

      {/* Activation distribution */}
      <div className="kpi-card mb-6">
        <h3 className="text-sm font-semibold mb-3" style={{ color:'var(--text-primary)' }}>Activation Function Distribution</h3>
        <div className="flex flex-wrap gap-2">
          {Object.entries(actGroups).map(([act, count]) => (
            <div key={act} className="px-3 py-1.5 rounded flex items-center gap-2" style={{ background:`${ACT_COLORS[act]??'#64748b'}15`, border:`1px solid ${ACT_COLORS[act]??'#64748b'}40` }}>
              <span className="text-xs font-semibold" style={{ color:ACT_COLORS[act]??'#64748b' }}>{act}</span>
              <span className="text-xs" style={{ color:'var(--text-muted)' }}>×{count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Full config table */}
      <div className="kpi-card overflow-x-auto">
        <h3 className="text-sm font-semibold mb-3" style={{ color:'var(--text-primary)' }}>All 20 Algorithm Configurations</h3>
        <table className="data-table">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Algorithm</th>
              <th>Hidden Layers</th>
              <th>Activation</th>
              <th>Learning Rate</th>
              <th>L2 λ</th>
              <th>Dropout</th>
              <th>Epochs</th>
              <th>Parameters</th>
              <th>Test Acc</th>
              <th>Test F1</th>
              <th>Test AUC</th>
            </tr>
          </thead>
          <tbody>
            {models.map(m => (
              <tr key={m.algorithm}>
                <td><span className="font-bold" style={{ color:'var(--accent)' }}>#{m.rank}</span></td>
                <td><span className="font-mono text-xs">{m.algorithm}</span></td>
                <td><span className="font-mono text-xs">{m.hidden_layers || '—'}</span></td>
                <td>
                  <span className="badge" style={{ background:`${ACT_COLORS[m.activation]??'#64748b'}22`, color:ACT_COLORS[m.activation]??'#64748b' }}>
                    {m.activation}
                  </span>
                </td>
                <td className="font-mono text-xs">{m.learning_rate}</td>
                <td className="font-mono text-xs">{m.l2}</td>
                <td className="font-mono text-xs">{m.dropout > 0 ? m.dropout : '—'}</td>
                <td className="font-mono text-xs">{m.epochs}</td>
                <td className="font-mono text-xs">{m.parameters.toLocaleString()}</td>
                <td style={{ color:m.test_accuracy>=0.8?'#22c55e':'#f59e0b', fontWeight:600 }}>{(m.test_accuracy*100).toFixed(1)}%</td>
                <td>{(m.test_f1*100).toFixed(1)}%</td>
                <td>{m.test_auc.toFixed(4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs mt-3" style={{ color:'var(--text-muted)' }}>
          Source: <code>mitcf_pipeline/deep_training.py</code> — <code>algorithm_configs</code> list, <code>train_twenty_algorithms()</code>.
          Feature encoding: SHA-1 hash-based <code>HashingVectorizer</code> with {manifest?.feature_dimensions ?? 64} dimensions.
        </p>
      </div>

      {/* Training procedure note */}
      <div className="kpi-card mt-6" style={{ borderLeft:'3px solid #a855f7' }}>
        <h3 className="text-sm font-semibold mb-2" style={{ color:'var(--text-primary)' }}>Training Procedure</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs" style={{ color:'var(--text-secondary)' }}>
          <div>
            <div className="font-semibold mb-1" style={{ color:'var(--text-primary)' }}>Optimizer</div>
            <p>SGD with manual backpropagation. Weight updates: <code>w -= lr × grad + l2 × w</code></p>
          </div>
          <div>
            <div className="font-semibold mb-1" style={{ color:'var(--text-primary)' }}>Loss Function</div>
            <p>Binary cross-entropy: <code>−(y log p + (1−y) log(1−p))</code> with numeric clipping to prevent log(0)</p>
          </div>
          <div>
            <div className="font-semibold mb-1" style={{ color:'var(--text-primary)' }}>Evaluation</div>
            <p>Per-epoch val accuracy + F1 + AUC. Final test metrics on 15% held-out split. Ranking by F1 → AUC → Accuracy.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
