'use client';
import { useEffect, useState } from 'react';
const API = 'http://localhost:8080';

interface Manifest {
  run_id?: string; model?: string; split?: string; item_count?: number;
  n_conditions?: number; python_version?: string; platform?: string;
  timestamp?: string; seed?: number; input_path?: string;
  max_revision_attempts?: number; verification_threshold?: number;
  bootstrap_samples?: number; conditions?: string[];
}

export default function ExperimentConfigPage() {
  const [runs, setRuns] = useState<{run_id:string}[]>([]);
  const [selectedRun, setSelectedRun] = useState('');
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/api/experiments`).then(r=>r.json()).then((r:{run_id:string}[]) => {
      setRuns(r);
      if (r.length) setSelectedRun(r[r.length-1].run_id);
      setLoading(false);
    }).catch(()=>setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedRun) return;
    fetch(`${API}/api/experiments/${selectedRun}/manifest`).then(r=>r.json()).then(setManifest).catch(()=>{});
  }, [selectedRun]);

  if (loading) return <div className="text-sm" style={{ color:'var(--text-muted)' }}>Loading...</div>;

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold" style={{ color:'var(--text-primary)' }}>Experiment Configuration</h2>
        <p className="text-sm mt-1" style={{ color:'var(--text-muted)' }}>
          Configuration manifest for each completed experiment run — recorded at experiment start.
        </p>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <label className="text-xs" style={{ color:'var(--text-muted)' }}>Run:</label>
        <select value={selectedRun} onChange={e=>setSelectedRun(e.target.value)}
          className="text-xs px-2 py-1 rounded" style={{ background:'var(--bg-card)', border:'1px solid var(--border)', color:'var(--text-primary)' }}>
          {runs.map(r=><option key={r.run_id} value={r.run_id}>{r.run_id}</option>)}
        </select>
      </div>

      {manifest && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            {[
              ['Run ID', manifest.run_id ?? selectedRun],
              ['Python', manifest.python_version ?? '—'],
              ['Platform', manifest.platform ?? '—'],
              ['Timestamp', manifest.timestamp ? new Date(manifest.timestamp).toLocaleDateString() : '—'],
              ['Items', manifest.item_count ?? '—'],
              ['Conditions', manifest.n_conditions ?? '—'],
              ['Seed', manifest.seed ?? '—'],
              ['Split', manifest.split ?? '—'],
            ].map(([k, v]) => (
              <div key={k as string} className="kpi-card p-3">
                <div className="text-xs" style={{ color:'var(--text-muted)', fontSize:'10px' }}>{k}</div>
                <div className="text-sm font-bold mt-0.5 truncate" style={{ color:'var(--accent)' }}>{v as string}</div>
              </div>
            ))}
          </div>

          {manifest.conditions && (
            <div className="kpi-card mb-6">
              <h3 className="text-sm font-semibold mb-3" style={{ color:'var(--text-primary)' }}>Conditions Run</h3>
              <div className="flex flex-wrap gap-2">
                {manifest.conditions.map(c=>(
                  <span key={c} className="badge" style={{ background:'rgba(59,130,246,0.1)', color:'#93c5fd' }}>{c}</span>
                ))}
              </div>
            </div>
          )}

          <div className="kpi-card">
            <h3 className="text-sm font-semibold mb-3" style={{ color:'var(--text-primary)' }}>Full Manifest JSON</h3>
            <pre className="text-xs p-4 rounded overflow-auto" style={{ background:'rgba(0,0,0,0.3)', color:'#93c5fd', maxHeight:'400px' }}>
              {JSON.stringify(manifest, null, 2)}
            </pre>
          </div>
        </>
      )}
    </div>
  );
}
