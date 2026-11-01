'use client';
import { useEffect, useState } from 'react';
const API = 'http://localhost:8080';

interface ModelRow {
  rank: number; algorithm: string; hidden_layers: string; activation: string;
  learning_rate: number; l2: number; dropout: number; epochs: number; parameters: number;
  test_accuracy: number; test_f1: number;
}

const ACT_COLORS: Record<string, string> = {
  relu:'#3b82f6', leaky_relu:'#6366f1', tanh:'#f59e0b', sigmoid:'#ef4444',
  elu:'#22c55e', swish:'#a855f7', gelu:'#f97316', softplus:'#06b6d4',
};

function parseHiddenLayers(hl: string): number[] {
  if (!hl || hl === 'none' || hl === '0') return [];
  return hl.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n > 0);
}

function LayerBox({ dim, label, color, params }: { dim: number; label: string; color: string; params?: string }) {
  const h = Math.max(36, Math.min(120, dim * 1.5));
  return (
    <div className="flex flex-col items-center">
      <div className="text-xs mb-1" style={{ color:'var(--text-muted)', fontSize:'10px' }}>{label}</div>
      <div className="rounded-lg flex items-center justify-center font-mono text-xs font-bold" style={{
        background:`${color}20`, border:`1.5px solid ${color}60`, color, height:`${h}px`, width:'50px', fontSize:'11px',
      }}>{dim}</div>
      {params && <div className="text-xs mt-1" style={{ color:'var(--text-muted)', fontSize:'9px' }}>{params}</div>}
    </div>
  );
}

function Arrow() {
  return <div className="flex items-center mx-1" style={{ color:'#475569', fontSize:'18px' }}>→</div>;
}

export default function NeuralArchitecturePage() {
  const [models, setModels] = useState<ModelRow[]>([]);
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/api/deep-learning/models`).then(r=>r.json()).then((m: ModelRow[]) => {
      const sorted = m.sort((a,b)=>a.rank-b.rank);
      setModels(sorted);
      if (sorted.length) setSelected(sorted[0].algorithm);
      setLoading(false);
    }).catch(()=>setLoading(false));
  }, []);

  const m = models.find(x=>x.algorithm===selected);
  const hidden = m ? parseHiddenLayers(m.hidden_layers) : [];
  const inputDim = 64;
  const outputDim = 1;
  const actColor = m ? (ACT_COLORS[m.activation] ?? '#64748b') : '#64748b';

  function layerParams(inD: number, outD: number): string {
    return `${(inD*outD + outD).toLocaleString()} params`;
  }

  if (loading) return <div className="text-sm" style={{ color:'var(--text-muted)' }}>Loading architecture data...</div>;

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold" style={{ color:'var(--text-primary)' }}>Neural Architecture</h2>
        <p className="text-sm mt-1" style={{ color:'var(--text-muted)' }}>
          Layer-by-layer MLP diagrams for all 20 custom neural network variants. Input: 64-dim HashingVectorizer features.
        </p>
      </div>

      {/* Model selector */}
      <div className="flex flex-wrap gap-2 mb-4">
        {models.map(mod => (
          <button key={mod.algorithm} onClick={()=>setSelected(mod.algorithm)}
            className="text-xs px-2.5 py-1 rounded transition-all"
            style={{
              background: selected===mod.algorithm ? `${ACT_COLORS[mod.activation]??'#3b82f6'}25` : 'var(--bg-card)',
              border: `1px solid ${selected===mod.algorithm ? ACT_COLORS[mod.activation]??'#3b82f6' : 'var(--border)'}`,
              color: selected===mod.algorithm ? ACT_COLORS[mod.activation]??'#3b82f6' : 'var(--text-secondary)',
            }}>
            #{mod.rank} {mod.algorithm.replace(/^\d+_/,'')}
          </button>
        ))}
      </div>

      {m && (
        <>
          {/* Architecture diagram */}
          <div className="kpi-card mb-6">
            <div className="flex items-center gap-3 mb-4">
              <h3 className="text-sm font-semibold" style={{ color:'var(--text-primary)' }}>{m.algorithm}</h3>
              <span className="badge" style={{ background:`${actColor}20`, color:actColor }}>{m.activation}</span>
              <span className="text-xs" style={{ color:'var(--text-muted)' }}>Rank #{m.rank}</span>
            </div>

            <div className="flex items-end gap-1 overflow-x-auto pb-4 min-h-[160px]">
              <LayerBox dim={inputDim} label="Input" color="#64748b" params="HashVec 64-dim" />
              <Arrow />
              {hidden.map((h, i) => {
                const prevDim = i === 0 ? inputDim : hidden[i-1];
                return (
                  <div key={i} className="flex items-end gap-1">
                    <LayerBox dim={h} label={`Hidden ${i+1}`} color={actColor} params={layerParams(prevDim, h)} />
                    <Arrow />
                  </div>
                );
              })}
              {hidden.length === 0 && (
                <div className="flex items-center text-xs" style={{ color:'var(--text-muted)' }}>
                  (no hidden layers — logistic regression)
                </div>
              )}
              <LayerBox dim={outputDim} label="Output" color="#22c55e" params={`sigmoid\n${layerParams(hidden.length?hidden[hidden.length-1]:inputDim,1)}`} />
            </div>

            <div className="text-xs mt-2 p-3 rounded" style={{ background:'rgba(0,0,0,0.2)', color:'var(--text-muted)' }}>
              {hidden.length > 0
                ? `${hidden.length}-hidden-layer MLP: [64] → [${hidden.join(' → ')}] → [1]`
                : 'Single-layer logistic regression: [64] → [1] (sigmoid)'}
              {m.dropout > 0 && ` + Dropout(p=${m.dropout})`}
              {m.l2 > 0 && ` + L2(λ=${m.l2})`}
            </div>
          </div>

          {/* Hyperparameter card */}
          <div className="kpi-card mb-6">
            <h3 className="text-sm font-semibold mb-3" style={{ color:'var(--text-primary)' }}>Architecture Details</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                ['Hidden Layers', m.hidden_layers || 'none'],
                ['Activation', m.activation],
                ['Learning Rate', m.learning_rate],
                ['L2 Regularization', m.l2],
                ['Dropout', m.dropout > 0 ? m.dropout : 'none'],
                ['Epochs', m.epochs],
                ['Total Parameters', m.parameters.toLocaleString()],
                ['Test Accuracy', `${(m.test_accuracy*100).toFixed(1)}%`],
              ].map(([k, v]) => (
                <div key={k as string} className="p-2 rounded" style={{ background:'rgba(255,255,255,0.03)', border:'1px solid var(--border)' }}>
                  <div className="text-xs" style={{ color:'var(--text-muted)' }}>{k}</div>
                  <div className="text-sm font-semibold mt-0.5" style={{ color:'var(--text-primary)' }}>{v as string}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Implementation note */}
          <div className="kpi-card" style={{ borderLeft:'3px solid #3b82f6' }}>
            <h3 className="text-sm font-semibold mb-2" style={{ color:'var(--text-primary)' }}>Implementation Note</h3>
            <p className="text-sm" style={{ color:'var(--text-secondary)' }}>
              All 20 networks are pure Python implementations — no TensorFlow, PyTorch, or NumPy.
              Forward pass, backward pass, and weight updates are implemented manually using only Python standard library math.
              Features are 64-dimensional SHA-1 hash-based vectors from <code className="text-xs px-1">HashingVectorizer</code>.
            </p>
            <p className="text-xs mt-2" style={{ color:'var(--text-muted)' }}>
              Source: <code>mitcf_pipeline/deep_training.py</code> — <code>NeuralBinaryClassifier</code>, <code>HashingVectorizer</code>
            </p>
          </div>
        </>
      )}
    </div>
  );
}
