'use client';
import { useEffect, useState } from 'react';
const API = 'http://localhost:8080';

interface Job { job_id: string; status: string; message: string; started_at: string; finished_at: string | null; error: string | null; result: Record<string, unknown> | null; }

export default function ExperimentMonitorPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  function loadJobs() {
    fetch(`${API}/api/experiments/jobs`).then(r=>r.json()).then(j=>{setJobs(j); setLoading(false);}).catch(()=>setLoading(false));
  }

  useEffect(() => {
    loadJobs();
    const id = setInterval(loadJobs, 5000);
    return () => clearInterval(id);
  }, []);

  const statusColor: Record<string, string> = { running:'#f59e0b', completed:'#22c55e', failed:'#ef4444', pending:'#64748b' };
  const running = jobs.filter(j=>j.status==='running');
  const completed = jobs.filter(j=>j.status==='completed');
  const failed = jobs.filter(j=>j.status==='failed');

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold" style={{ color:'var(--text-primary)' }}>Experiment Monitor</h2>
        <p className="text-sm mt-1" style={{ color:'var(--text-muted)' }}>
          Live status of experiment and training jobs. Auto-refreshes every 5 seconds.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label:'Running', count:running.length, color:'#f59e0b' },
          { label:'Completed', count:completed.length, color:'#22c55e' },
          { label:'Failed', count:failed.length, color:'#ef4444' },
        ].map(({label,count,color}) => (
          <div key={label} className="kpi-card text-center p-3" style={{ borderTop:`2px solid ${color}` }}>
            <div className="text-2xl font-bold" style={{ color }}>{count}</div>
            <div className="text-xs mt-1" style={{ color:'var(--text-muted)' }}>{label}</div>
          </div>
        ))}
      </div>

      <div className="kpi-card">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold" style={{ color:'var(--text-primary)' }}>All Jobs</h3>
          <div className="flex items-center gap-2">
            <span className="text-xs" style={{ color:'var(--text-muted)' }}>auto-refresh ●</span>
            <button onClick={loadJobs} className="text-xs px-2 py-1 rounded" style={{ background:'rgba(59,130,246,0.1)', border:'1px solid rgba(59,130,246,0.3)', color:'#93c5fd' }}>
              Refresh now
            </button>
          </div>
        </div>

        {loading && <p className="text-sm" style={{ color:'var(--text-muted)' }}>Loading jobs...</p>}
        {!loading && jobs.length === 0 && (
          <p className="text-sm" style={{ color:'var(--text-muted)' }}>
            No jobs yet. Use <a href="/run-experiment" style={{ color:'var(--accent)' }}>Run Experiment</a> or <a href="/training-monitor" style={{ color:'var(--accent)' }}>Training Monitor</a> to launch a job.
          </p>
        )}

        <div className="space-y-3">
          {jobs.map(j => (
            <div key={j.job_id} className="p-3 rounded-lg" style={{ background:'rgba(255,255,255,0.025)', border:`1px solid ${statusColor[j.status]??'#334155'}40` }}>
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-mono text-xs font-bold" style={{ color:'var(--text-primary)' }}>{j.job_id}</span>
                <span className="badge" style={{ background:`${statusColor[j.status]}20`, color:statusColor[j.status] }}>{j.status}</span>
                {j.status === 'running' && (
                  <span className="text-xs flex items-center gap-1" style={{ color:'#f59e0b' }}>
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                    running
                  </span>
                )}
              </div>
              <p className="text-xs mt-1.5" style={{ color:'var(--text-secondary)' }}>{j.message}</p>
              {j.error && (
                <div className="mt-2 p-2 rounded text-xs" style={{ background:'rgba(239,68,68,0.1)', color:'#ef4444', border:'1px solid rgba(239,68,68,0.2)' }}>
                  {j.error}
                </div>
              )}
              <div className="flex gap-4 mt-2 text-xs" style={{ color:'var(--text-muted)', fontSize:'10px' }}>
                <span>Started: {new Date(j.started_at).toLocaleString()}</span>
                {j.finished_at && <span>Finished: {new Date(j.finished_at).toLocaleString()}</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
