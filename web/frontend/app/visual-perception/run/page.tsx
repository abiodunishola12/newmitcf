'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';

const API = 'http://localhost:8080';

interface Job {
  job_id: string; command: string; status: string; message: string;
  started_at: string; finished_at: string; error: string; stdout_tail: string[];
}

const SUBCOMMANDS = [
  { id: 'evaluate', label: 'Full Evaluation', desc: 'Run all 4 conditions on POPE + MME (requires both datasets + model)', color: '#22c55e' },
  { id: 'smoke-test', label: 'Smoke Test', desc: '1-image sanity check (requires POPE + model, auto-downloads model)', color: '#3b82f6' },
  { id: 'robustness', label: 'Robustness', desc: 'Perturbation evaluation on evaluation results', color: '#ef4444' },
  { id: 'ablation', label: 'Ablation Studies', desc: '7 ablation configurations', color: '#f59e0b' },
  { id: 'validate-data', label: 'Validate Data', desc: 'Check POPE + MME dataset integrity (no model needed)', color: '#8b5cf6' },
];

const statusColor: Record<string, string> = {
  running: '#f59e0b', completed: '#22c55e', failed: '#ef4444', pending: '#64748b',
};

export default function VPRunPage() {
  const [selected, setSelected] = useState('evaluate');
  const [launching, setLaunching] = useState(false);
  const [jobId, setJobId] = useState('');
  const [job, setJob] = useState<Job | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [err, setErr] = useState('');
  const [pollLog, setPollLog] = useState(false);

  // Load job history
  useEffect(() => {
    fetch(`${API}/api/visual-perception/jobs`).then(r => r.json()).then(setJobs).catch(() => {});
  }, []);

  // Poll active job
  useEffect(() => {
    if (!jobId || !job || job.status === 'completed' || job.status === 'failed') return;
    const id = setInterval(() => {
      fetch(`${API}/api/visual-perception/jobs/${jobId}`).then(r => r.json()).then(j => {
        setJob(j);
        if (j.status === 'completed' || j.status === 'failed') {
          clearInterval(id);
          // Refresh job list
          fetch(`${API}/api/visual-perception/jobs`).then(r => r.json()).then(setJobs).catch(() => {});
        }
      });
    }, 3000);
    return () => clearInterval(id);
  }, [jobId, job?.status]);

  async function launch() {
    setLaunching(true); setErr(''); setJob(null);
    try {
      const r = await fetch(`${API}/api/visual-perception/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subcommand: selected, extra_args: [] }),
      });
      const j = await r.json();
      if (j.job_id) {
        setJobId(j.job_id);
        setJob(j);
      } else {
        setErr(j.detail || JSON.stringify(j));
      }
    } catch (e) { setErr(String(e)); }
    finally { setLaunching(false); }
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Run Visual-Perception Evaluation</h2>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
          Launch evaluation jobs in a background process. Results are written to{' '}
          <code>results/visual_perception/</code> and appear in the Overview page when complete.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Command selector */}
        <div className="space-y-4">
          <div className="kpi-card">
            <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Select Command</h3>
            <div className="space-y-2">
              {SUBCOMMANDS.map(cmd => (
                <button key={cmd.id} onClick={() => setSelected(cmd.id)}
                  className="w-full text-left p-3 rounded transition-colors"
                  style={{
                    background: selected === cmd.id ? `${cmd.color}18` : 'rgba(0,0,0,0.2)',
                    border: `1px solid ${selected === cmd.id ? cmd.color : 'var(--border)'}`,
                  }}>
                  <div className="text-xs font-semibold mb-0.5" style={{ color: selected === cmd.id ? cmd.color : 'var(--text-primary)' }}>
                    {cmd.label}
                  </div>
                  <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{cmd.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="kpi-card" style={{ borderLeft: '3px solid #f59e0b' }}>
            <h4 className="text-xs font-semibold mb-2" style={{ color: '#f59e0b' }}>Prerequisites</h4>
            <ul className="text-xs space-y-1" style={{ color: 'var(--text-secondary)' }}>
              <li>â€¢ evaluate / smoke-test: POPE dataset + Qwen2.5-VL-3B-Instruct weights</li>
              <li>â€¢ robustness / ablation: needs a completed evaluate run first</li>
              <li>â€¢ validate-data: checks datasets only, no model needed</li>
            </ul>
            <Link href="/visual-perception/datasets" className="text-xs mt-2 block" style={{ color: 'var(--accent)' }}>
              Check dataset status â†'
            </Link>
          </div>

          {err && (
            <div className="p-2 rounded text-xs" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}>
              {err}
            </div>
          )}

          <button onClick={launch} disabled={launching}
            className="btn-primary w-full py-2 rounded text-sm font-semibold" style={{ opacity: launching ? 0.6 : 1 }}>
            {launching ? 'Launchingâ€¦' : `Run: visual_perception.cli ${selected}`}
          </button>
        </div>

        {/* Active job + log */}
        <div className="space-y-4">
          {job && (
            <div className="kpi-card" style={{ borderTop: `2px solid ${statusColor[job.status] ?? '#64748b'}` }}>
              <div className="flex items-center gap-3 mb-3">
                <span className="badge font-bold text-xs" style={{
                  background: `${statusColor[job.status] ?? '#64748b'}20`,
                  color: statusColor[job.status] ?? '#64748b',
                }}>
                  {job.status}
                </span>
                <code className="text-xs" style={{ color: 'var(--text-muted)' }}>job:{job.job_id}</code>
                {job.status === 'running' && (
                  <span className="text-xs animate-pulse" style={{ color: '#f59e0b' }}>â-- polling</span>
                )}
              </div>
              <p className="text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>{job.message}</p>
              {job.error && <p className="text-xs" style={{ color: '#ef4444' }}>{job.error}</p>}

              {/* Live log */}
              {job.stdout_tail.length > 0 && (
                <div>
                  <button onClick={() => setPollLog(v => !v)} className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
                    {pollLog ? 'â-¼ Hide log' : 'â-¶ Show log'}
                  </button>
                  {pollLog && (
                    <pre className="text-xs p-3 rounded overflow-auto max-h-64"
                      style={{ background: 'rgba(0,0,0,0.4)', color: '#93c5fd', margin: 0 }}>
                      {job.stdout_tail.join('\n')}
                    </pre>
                  )}
                </div>
              )}

              {job.status === 'completed' && (
                <div className="mt-3 p-2 rounded" style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)' }}>
                  <p className="text-xs" style={{ color: '#22c55e' }}>
                    âœ" Done. Results written to <code>results/visual_perception/</code>.{' '}
                    <Link href="/visual-perception" style={{ color: '#22c55e' }}>View Overview â†'</Link>
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Job history */}
          {jobs.length > 0 && (
            <div className="kpi-card">
              <h4 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Job History (this session)</h4>
              <div className="space-y-2">
                {jobs.slice(0, 8).map(j => (
                  <div key={j.job_id} className="flex items-center justify-between text-xs p-2 rounded"
                    style={{ background: 'rgba(0,0,0,0.2)' }}>
                    <div>
                      <code style={{ color: 'var(--text-muted)' }}>job:{j.job_id}</code>
                      <span className="ml-2" style={{ color: 'var(--text-secondary)' }}>{j.command}</span>
                    </div>
                    <span className="badge" style={{
                      background: `${statusColor[j.status] ?? '#64748b'}20`,
                      color: statusColor[j.status] ?? '#64748b',
                    }}>{j.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
