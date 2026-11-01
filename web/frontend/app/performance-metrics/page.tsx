'use client';
import { useEffect, useState, useMemo } from 'react';
import dynamic from 'next/dynamic';

const Plot = dynamic(() => import('react-plotly.js'), { ssr: false });
const API = 'http://localhost:8080';

interface ModelRow {
  rank: number; algorithm: string; hidden_layers: string; activation: string;
  learning_rate: number; l2: number; dropout: number; epochs: number; parameters: number;
  train_accuracy: number; validation_accuracy: number; test_accuracy: number;
  test_precision: number; test_recall: number; test_f1: number; test_auc: number;
  test_log_loss: number; train_log_loss: number; validation_log_loss: number;
  train_examples: number; validation_examples: number; test_examples: number;
}

function pct(v: number) { return `${(v * 100).toFixed(1)}%`; }
function badge(act: string) {
  const map: Record<string, string> = { relu:'#3b82f6', leaky_relu:'#6366f1', tanh:'#f59e0b', sigmoid:'#ef4444', elu:'#22c55e', swish:'#a855f7', gelu:'#f97316', softplus:'#06b6d4' };
  const c = map[act] ?? '#64748b';
  return <span className="badge" style={{ background: `${c}22`, color: c }}>{act}</span>;
}

type SortKey = keyof ModelRow;

export default function PerformanceMetricsPage() {
  const [models, setModels] = useState<ModelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterAct, setFilterAct] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('rank');
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  const [tab, setTab] = useState<'table' | 'chart'>('table');

  useEffect(() => {
    fetch(`${API}/api/deep-learning/models`).then(r => r.json()).then(m => {
      setModels(m);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const activations = useMemo(() => Array.from(new Set(models.map(m => m.activation))).sort(), [models]);

  const filtered = useMemo(() => {
    let rows = filterAct === 'all' ? [...models] : models.filter(m => m.activation === filterAct);
    rows.sort((a, b) => {
      const av = a[sortKey] as number, bv = b[sortKey] as number;
      return (av < bv ? -1 : av > bv ? 1 : 0) * sortDir;
    });
    return rows;
  }, [models, filterAct, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 1 ? -1 : 1);
    else { setSortKey(key); setSortDir(1); }
  }

  const Th = ({ k, label }: { k: SortKey; label: string }) => (
    <th onClick={() => toggleSort(k)} style={{ cursor: 'pointer', userSelect: 'none' }}>
      {label}{sortKey === k ? (sortDir === 1 ? ' ↑' : ' ↓') : ''}
    </th>
  );

  const names = filtered.map(m => m.algorithm.replace(/^\d+_/, ''));

  if (loading) return <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading metrics...</div>;

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Performance Metrics</h2>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
          Complete performance breakdown for all {models.length} models — sortable, filterable
        </p>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-3 mb-4 items-center">
        <div>
          <label className="text-xs mr-2" style={{ color: 'var(--text-muted)' }}>Activation:</label>
          <select value={filterAct} onChange={e => setFilterAct(e.target.value)}
            className="text-xs px-2 py-1 rounded" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
            <option value="all">All</option>
            {activations.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div className="flex gap-1">
          {(['table','chart'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} className="text-xs px-3 py-1 rounded"
              style={{ background: tab === t ? 'var(--accent)' : 'var(--bg-card)', color: tab === t ? '#fff' : 'var(--text-secondary)', border: '1px solid var(--border)' }}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{filtered.length} models</span>
      </div>

      {tab === 'table' && (
        <div className="kpi-card overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <Th k="rank" label="Rank" />
                <th>Algorithm</th>
                <th>Activation</th>
                <Th k="parameters" label="Params" />
                <Th k="train_accuracy" label="Train Acc" />
                <Th k="validation_accuracy" label="Val Acc" />
                <Th k="test_accuracy" label="Test Acc" />
                <Th k="test_precision" label="Precision" />
                <Th k="test_recall" label="Recall" />
                <Th k="test_f1" label="F1" />
                <Th k="test_auc" label="AUC" />
                <Th k="test_log_loss" label="Log Loss" />
              </tr>
            </thead>
            <tbody>
              {filtered.map(m => (
                <tr key={m.algorithm}>
                  <td><span className="font-bold" style={{ color: 'var(--accent)' }}>#{m.rank}</span></td>
                  <td><span className="font-mono text-xs">{m.algorithm}</span></td>
                  <td>{badge(m.activation)}</td>
                  <td className="font-mono text-xs">{m.parameters.toLocaleString()}</td>
                  <td>{pct(m.train_accuracy)}</td>
                  <td>{pct(m.validation_accuracy)}</td>
                  <td style={{ color: m.test_accuracy >= 0.8 ? '#22c55e' : '#f59e0b', fontWeight: 600 }}>{pct(m.test_accuracy)}</td>
                  <td>{pct(m.test_precision)}</td>
                  <td>{pct(m.test_recall)}</td>
                  <td>{pct(m.test_f1)}</td>
                  <td>{m.test_auc.toFixed(4)}</td>
                  <td style={{ color: m.test_log_loss < 0.5 ? '#22c55e' : '#f59e0b' }}>{m.test_log_loss.toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'chart' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[
            { metric: 'test_accuracy' as SortKey, label: 'Test Accuracy', colors: filtered.map(m => m.test_accuracy >= 0.8 ? '#22c55e' : '#f59e0b') },
            { metric: 'test_f1' as SortKey, label: 'Test F1', colors: filtered.map(() => '#3b82f6') },
            { metric: 'test_auc' as SortKey, label: 'Test AUC', colors: filtered.map(() => '#a855f7') },
            { metric: 'test_log_loss' as SortKey, label: 'Log Loss (lower=better)', colors: filtered.map(() => '#f59e0b') },
          ].map(({ metric, label, colors }) => (
            <div key={metric} className="kpi-card">
              <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>{label}</h3>
              <Plot
                data={[{ type: 'bar', x: names, y: filtered.map(m => m[metric] as number), marker: { color: colors } }]}
                layout={{
                  paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
                  margin: { t: 5, l: 45, r: 5, b: 80 }, height: 220,
                  xaxis: { color: '#94a3b8', tickangle: -45, tickfont: { size: 9 } },
                  yaxis: { color: '#94a3b8' },
                }}
                config={{ displayModeBar: false }} style={{ width: '100%' }} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
