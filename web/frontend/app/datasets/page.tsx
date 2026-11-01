'use client';
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';

const Plot = dynamic(() => import('react-plotly.js'), { ssr: false });
const API = 'http://localhost:8080';

interface DatasetRow { dataset: string; n: string; accuracy?: string; hallucination_rate?: string; trustworthiness_index?: string; condition?: string; }
interface Manifest { algorithm_count: number; example_count: number; feature_dimensions: number; input_path: string; seed: number; splits: { train: number; validation: number; test: number }; positive_examples: number; negative_examples: number; }

export default function DatasetsPage() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [datasetMetrics, setDatasetMetrics] = useState<DatasetRow[]>([]);
  const [runs, setRuns] = useState<{run_id:string}[]>([]);
  const [selectedRun, setSelectedRun] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`${API}/api/deep-learning/manifest`).then(r=>r.json()),
      fetch(`${API}/api/experiments`).then(r=>r.json()),
    ]).then(([mf, r]) => {
      setManifest(mf);
      setRuns(r);
      if (r.length) setSelectedRun(r[r.length-1].run_id);
      setLoading(false);
    }).catch(()=>setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedRun) return;
    fetch(`${API}/api/experiments/${selectedRun}/dataset-metrics`).then(r=>r.json()).then(setDatasetMetrics).catch(()=>{});
  }, [selectedRun]);

  const datasets = Array.from(new Set(datasetMetrics.map(r=>r.dataset)));
  const conditions = Array.from(new Set(datasetMetrics.map(r=>r.condition))).filter(Boolean) as string[];
  const fullMitcfRows = datasetMetrics.filter(r=>r.condition==='full_mitcf');

  if (loading) return <div className="text-sm" style={{ color:'var(--text-muted)' }}>Loading dataset info...</div>;

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold" style={{ color:'var(--text-primary)' }}>Datasets</h2>
        <p className="text-sm mt-1" style={{ color:'var(--text-muted)' }}>
          Benchmark dataset composition and per-dataset performance metrics across conditions.
        </p>
      </div>

      {/* Training dataset summary */}
      {manifest && (
        <div className="kpi-card mb-6">
          <h3 className="text-sm font-semibold mb-3" style={{ color:'var(--text-primary)' }}>Training Dataset — {manifest.input_path}</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            {[
              ['Total Examples', manifest.example_count],
              ['Positive (Trustworthy)', manifest.positive_examples],
              ['Negative (Untrustworthy)', manifest.negative_examples],
              ['Feature Dimensions', manifest.feature_dimensions],
              ['Train Split', manifest.splits.train],
              ['Validation Split', manifest.splits.validation],
              ['Test Split', manifest.splits.test],
              ['Random Seed', manifest.seed],
            ].map(([k, v]) => (
              <div key={k as string} className="p-3 rounded text-center" style={{ background:'rgba(255,255,255,0.03)', border:'1px solid var(--border)' }}>
                <div className="text-xs" style={{ color:'var(--text-muted)', fontSize:'10px' }}>{k}</div>
                <div className="text-lg font-bold mt-0.5" style={{ color:'var(--accent)' }}>{v}</div>
              </div>
            ))}
          </div>
          {/* Class balance bar */}
          <div className="flex items-center gap-2 mt-2">
            <span className="text-xs" style={{ color:'var(--text-muted)' }}>Class balance:</span>
            <div className="flex-1 h-4 rounded overflow-hidden flex">
              <div style={{ width:`${(manifest.positive_examples/manifest.example_count)*100}%`, background:'#22c55e' }} className="flex items-center justify-center text-xs text-white font-bold">
                {((manifest.positive_examples/manifest.example_count)*100).toFixed(0)}%
              </div>
              <div style={{ width:`${(manifest.negative_examples/manifest.example_count)*100}%`, background:'#ef4444' }} className="flex items-center justify-center text-xs text-white font-bold">
                {((manifest.negative_examples/manifest.example_count)*100).toFixed(0)}%
              </div>
            </div>
            <span className="text-xs" style={{ color:'#22c55e' }}>Pos</span>
            <span className="text-xs" style={{ color:'#ef4444' }}>Neg</span>
          </div>
        </div>
      )}

      {/* Dataset metrics selector */}
      {runs.length > 0 && (
        <div className="flex items-center gap-3 mb-4">
          <label className="text-xs" style={{ color:'var(--text-muted)' }}>Run:</label>
          <select value={selectedRun} onChange={e=>setSelectedRun(e.target.value)}
            className="text-xs px-2 py-1 rounded" style={{ background:'var(--bg-card)', border:'1px solid var(--border)', color:'var(--text-primary)' }}>
            {runs.map(r=><option key={r.run_id} value={r.run_id}>{r.run_id}</option>)}
          </select>
        </div>
      )}

      {/* Per-dataset accuracy chart for full_mitcf */}
      {fullMitcfRows.length > 0 && (
        <div className="kpi-card mb-6">
          <h3 className="text-sm font-semibold mb-3" style={{ color:'var(--text-primary)' }}>Per-Dataset Accuracy — Full MITCF</h3>
          <Plot
            data={[{
              type:'bar',
              x: fullMitcfRows.map(r=>r.dataset),
              y: fullMitcfRows.map(r=>parseFloat(r.accuracy??'0')),
              marker:{ color: fullMitcfRows.map(r=>parseFloat(r.accuracy??'0')>=0.8?'#22c55e':'#f59e0b') },
              text: fullMitcfRows.map(r=>`${(parseFloat(r.accuracy??'0')*100).toFixed(0)}%`),
              textposition:'outside' as const,
            }]}
            layout={{
              paper_bgcolor:'transparent', plot_bgcolor:'transparent',
              margin:{t:10,l:45,r:10,b:60}, height:240,
              xaxis:{color:'#94a3b8',tickangle:-20},
              yaxis:{color:'#94a3b8',range:[0,1.2],title:{text:'Accuracy',font:{color:'#94a3b8',size:11}}},
            }}
            config={{ displayModeBar: false }} style={{ width:'100%' }} />
        </div>
      )}

      {/* Full per-dataset metrics table */}
      {datasetMetrics.length > 0 && (
        <div className="kpi-card overflow-x-auto">
          <h3 className="text-sm font-semibold mb-3" style={{ color:'var(--text-primary)' }}>Per-Dataset Metrics by Condition</h3>
          <table className="data-table">
            <thead><tr><th>Dataset</th><th>Condition</th><th>N</th><th>Accuracy</th><th>Hall. Rate</th><th>TI</th></tr></thead>
            <tbody>
              {datasetMetrics.map((r, i) => (
                <tr key={i}>
                  <td className="font-semibold text-xs">{r.dataset}</td>
                  <td className="font-mono text-xs">{r.condition}</td>
                  <td>{r.n}</td>
                  <td style={{ color:parseFloat(r.accuracy??'0')>=0.8?'#22c55e':'#f59e0b', fontWeight:600 }}>{r.accuracy ? `${(parseFloat(r.accuracy)*100).toFixed(1)}%` : '—'}</td>
                  <td style={{ color:parseFloat(r.hallucination_rate??'1')<0.1?'#22c55e':'#ef4444' }}>{r.hallucination_rate ? `${(parseFloat(r.hallucination_rate)*100).toFixed(1)}%` : '—'}</td>
                  <td style={{ color:parseFloat(r.trustworthiness_index??'0')>=0.8?'#22c55e':'#f59e0b' }}>{r.trustworthiness_index ? parseFloat(r.trustworthiness_index).toFixed(3) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Feature encoding note */}
      <div className="kpi-card mt-6" style={{ borderLeft:'3px solid #3b82f6' }}>
        <h3 className="text-sm font-semibold mb-2" style={{ color:'var(--text-primary)' }}>Feature Encoding</h3>
        <p className="text-sm" style={{ color:'var(--text-secondary)' }}>
          Text inputs are encoded using <code>HashingVectorizer</code>: each token is SHA-1 hashed, modulo {manifest?.feature_dimensions ?? 64}, to produce a fixed {manifest?.feature_dimensions ?? 64}-dimensional binary bag-of-words vector.
          No vocabulary required — zero external dependencies.
        </p>
        <p className="text-xs mt-2" style={{ color:'var(--text-muted)' }}>
          Source: <code>mitcf_pipeline/deep_training.py</code> — <code>HashingVectorizer</code>
        </p>
      </div>
    </div>
  );
}
