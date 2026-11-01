'use client';
import { useEffect, useState } from 'react';
const API = 'http://localhost:8080';

interface Job { job_id: string; status: string; message: string; started_at: string; finished_at: string | null; result: Record<string, unknown> | null; error: string | null; }

export default function TrainingMonitorPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [config, setConfig] = useState({ input_path:'data/sample_benchmark.jsonl', seed:42, feature_dimensions:64, graph_dir:'graph' });
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState('');
  const [pollJobId, setPollJobId] = useState<string | null>(null);

  useEffect(() => {
    loadJobs();
  }, []);

  useEffect(() => {
    if (!pollJobId) return;
    const id = setInterval(() => {
      fetch(`${API}/api/deep-learning/train/${pollJobId}`).then(r=>r.json()).then((j: Job) => {
        setJobs(prev => prev.map(x => x.job_id === j.job_id ? j : x));
        if (j.status === 'completed' || j.status === 'failed') { setPollJobId(null); clearInterval(id); }
      });
    }, 3000);
    return () => clearInterval(id);
  }, [pollJobId]);

  function loadJobs() {
    fetch(`${API}/api/experiments/jobs`).then(r=>r.json()).then(setJobs).catch(()=>{});
  }

  async function launchTraining() {
    setLaunching(true); setError('');
    try {
      const r = await fetch(`${API}/api/deep-learning/train`, {
        method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(config),
      });
      const j = await r.json();
      if (j.job_id) {
        setPollJobId(j.job_id);
        setJobs(prev => [{ job_id:j.job_id, status:j.status, message:j.message, started_at:new Date().toISOString(), finished_at:null, result:null, error:null }, ...prev]);
      }
    } catch (e) { setError(String(e)); }
    finally { setLaunching(false); }
  }

  const statusColor: Record<string, string> = { running:'#f59e0b', completed:'#22c55e', failed:'#ef4444', pending:'#64748b' };

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold" style={{ color:'var(--text-primary)' }}>Training Monitor</h2>
        <p className="text-sm mt-1" style={{ color:'var(--text-muted)' }}>
          Launch background training of all 20 neural network variants. Training runs the full <code>train_twenty_algorithms()</code> pipeline.
        </p>
      </div>

      {/* Warning */}
      <div className="kpi-card mb-6" style={{ borderLeft:'3px solid #f59e0b' }}>
        <h3 className="text-sm font-semibold mb-1" style={{ color:'#f59e0b' }}>Important</h3>
        <p className="text-sm" style={{ color:'var(--text-secondary)' }}>
          Training rewrites <code>graph/model_results.csv</code>, <code>graph/training_history.csv</code>, and all chart files.
          Only launch if you intend to regenerate the training outputs. Training uses the same seed and data as the original run.
        </p>
      </div>

      {/* Launch form */}
      <div className="kpi-card mb-6">
        <h3 className="text-sm font-semibold mb-4" style={{ color:'var(--text-primary)' }}>Launch Training</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          {[
            { key:'input_path', label:'Input Path', type:'text', desc:'Path to benchmark JSONL file' },
            { key:'graph_dir', label:'Graph Output Dir', type:'text', desc:'Directory for charts and CSVs' },
            { key:'seed', label:'Random Seed', type:'number', desc:'Reproducibility seed' },
            { key:'feature_dimensions', label:'Feature Dimensions', type:'number', desc:'HashingVectorizer output size' },
          ].map(({ key, label, type, desc }) => (
            <div key={key}>
              <label className="text-xs block mb-1 font-medium" style={{ color:'var(--text-primary)' }}>{label}</label>
              <input type={type} value={config[key as keyof typeof config]}
                onChange={e => setConfig(prev => ({ ...prev, [key]: type==='number' ? parseInt(e.target.value)||0 : e.target.value }))}
                className="w-full text-xs px-3 py-1.5 rounded" style={{ background:'rgba(0,0,0,0.3)', border:'1px solid var(--border)', color:'var(--text-primary)' }} />
              <div className="text-xs mt-0.5" style={{ color:'var(--text-muted)', fontSize:'10px' }}>{desc}</div>
            </div>
          ))}
        </div>
        {error && <div className="text-xs text-red-400 mb-3">{error}</div>}
        <button onClick={launchTraining} disabled={launching}
          className="btn-primary px-6 py-2 rounded text-sm font-semibold" style={{ opacity:launching?0.6:1 }}>
          {launching ? 'Launching...' : 'Launch Training (background)'}
        </button>
      </div>

      {/* Job list */}
      <div className="kpi-card">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold" style={{ color:'var(--text-primary)' }}>Job History</h3>
          <button onClick={loadJobs} className="text-xs px-2 py-1 rounded" style={{ background:'rgba(59,130,246,0.1)', border:'1px solid rgba(59,130,246,0.3)', color:'#93c5fd' }}>
            Refresh
          </button>
        </div>
        {jobs.length === 0 ? (
          <p className="text-sm" style={{ color:'var(--text-muted)' }}>No training jobs yet.</p>
        ) : (
          <div className="space-y-3">
            {jobs.map(j => (
              <div key={j.job_id} className="p-3 rounded-lg" style={{ background:'rgba(255,255,255,0.03)', border:'1px solid var(--border)' }}>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs" style={{ color:'var(--text-muted)' }}>{j.job_id}</span>
                  <span className="badge font-semibold" style={{ background:`${statusColor[j.status]??'#64748b'}20`, color:statusColor[j.status]??'#64748b' }}>
                    {j.status}
                  </span>
                  {j.status === 'running' && (
                    <span className="text-xs" style={{ color:'#f59e0b' }}>● polling every 3s</span>
                  )}
                </div>
                <p className="text-xs mt-1" style={{ color:'var(--text-secondary)' }}>{j.message}</p>
                {j.error && <p className="text-xs mt-1" style={{ color:'#ef4444' }}>{j.error}</p>}
                <div className="text-xs mt-1" style={{ color:'var(--text-muted)', fontSize:'10px' }}>
                  Started: {new Date(j.started_at).toLocaleString()}
                  {j.finished_at && ` · Finished: ${new Date(j.finished_at).toLocaleString()}`}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
