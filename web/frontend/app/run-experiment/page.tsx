'use client';
import { useState, useEffect } from 'react';
const API = 'http://localhost:8080';

interface Job { job_id: string; status: string; message: string; started_at: string; finished_at: string | null; error: string | null; }

const DEFAULTS = {
  input_path: 'data/sample_benchmark.jsonl',
  seed: 42, max_revision_attempts: 2, verification_threshold: 0.70,
  model_name: 'heuristic-local-model', split: 'all', bootstrap_samples: 200,
  calibrate_detector: false, use_label_for_verification: true,
  ti_weight_hallucination: 0.25, ti_weight_bias: 0.25,
  ti_weight_robustness: 0.25, ti_weight_decision: 0.25,
};

export default function RunExperimentPage() {
  const [config, setConfig] = useState(DEFAULTS);
  const [launching, setLaunching] = useState(false);
  const [jobId, setJobId] = useState('');
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!jobId || !job || job.status === 'completed' || job.status === 'failed') return;
    const id = setInterval(() => {
      fetch(`${API}/api/experiments/jobs/${jobId}`).then(r=>r.json()).then(setJob);
    }, 4000);
    return () => clearInterval(id);
  }, [jobId, job?.status]);

  async function launch() {
    setLaunching(true); setError(''); setJob(null);
    const tiTotal = config.ti_weight_hallucination + config.ti_weight_bias + config.ti_weight_robustness + config.ti_weight_decision;
    if (Math.abs(tiTotal - 1.0) > 0.01) { setError(`TI weights must sum to 1.0 (current sum: ${tiTotal.toFixed(2)})`); setLaunching(false); return; }
    try {
      const r = await fetch(`${API}/api/experiments/run`, {
        method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(config),
      });
      const j = await r.json();
      if (j.job_id) {
        setJobId(j.job_id);
        setJob({ job_id:j.job_id, status:j.status, message:j.message, started_at:new Date().toISOString(), finished_at:null, error:null });
      }
    } catch (e) { setError(String(e)); }
    finally { setLaunching(false); }
  }

  function set<K extends keyof typeof DEFAULTS>(key: K, val: typeof DEFAULTS[K]) {
    setConfig(prev => ({ ...prev, [key]: val }));
  }

  const statusColor: Record<string, string> = { running:'#f59e0b', completed:'#22c55e', failed:'#ef4444', pending:'#64748b' };

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold" style={{ color:'var(--text-primary)' }}>Run Experiment</h2>
        <p className="text-sm mt-1" style={{ color:'var(--text-muted)' }}>
          Launch a new MITCF pipeline run. Runs all 5 ablation conditions on the benchmark dataset in a background thread.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Config form */}
        <div className="space-y-4">
          <div className="kpi-card">
            <h3 className="text-sm font-semibold mb-4" style={{ color:'var(--text-primary)' }}>Pipeline Configuration</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color:'var(--text-primary)' }}>Input Path</label>
                <input type="text" value={config.input_path} onChange={e=>set('input_path',e.target.value)}
                  className="w-full text-xs px-3 py-1.5 rounded" style={{ background:'rgba(0,0,0,0.3)', border:'1px solid var(--border)', color:'var(--text-primary)' }} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium block mb-1" style={{ color:'var(--text-primary)' }}>Seed</label>
                  <input type="number" value={config.seed} onChange={e=>set('seed',parseInt(e.target.value)||0)}
                    className="w-full text-xs px-3 py-1.5 rounded" style={{ background:'rgba(0,0,0,0.3)', border:'1px solid var(--border)', color:'var(--text-primary)' }} />
                </div>
                <div>
                  <label className="text-xs font-medium block mb-1" style={{ color:'var(--text-primary)' }}>Max Revisions</label>
                  <input type="number" min={0} max={5} value={config.max_revision_attempts} onChange={e=>set('max_revision_attempts',parseInt(e.target.value)||0)}
                    className="w-full text-xs px-3 py-1.5 rounded" style={{ background:'rgba(0,0,0,0.3)', border:'1px solid var(--border)', color:'var(--text-primary)' }} />
                </div>
                <div>
                  <label className="text-xs font-medium block mb-1" style={{ color:'var(--text-primary)' }}>Verification Threshold</label>
                  <input type="number" min={0} max={1} step={0.05} value={config.verification_threshold} onChange={e=>set('verification_threshold',parseFloat(e.target.value)||0)}
                    className="w-full text-xs px-3 py-1.5 rounded" style={{ background:'rgba(0,0,0,0.3)', border:'1px solid var(--border)', color:'var(--text-primary)' }} />
                </div>
                <div>
                  <label className="text-xs font-medium block mb-1" style={{ color:'var(--text-primary)' }}>Bootstrap Samples</label>
                  <input type="number" min={50} max={5000} value={config.bootstrap_samples} onChange={e=>set('bootstrap_samples',parseInt(e.target.value)||200)}
                    className="w-full text-xs px-3 py-1.5 rounded" style={{ background:'rgba(0,0,0,0.3)', border:'1px solid var(--border)', color:'var(--text-primary)' }} />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color:'var(--text-primary)' }}>Split</label>
                <select value={config.split} onChange={e=>set('split',e.target.value)}
                  className="w-full text-xs px-3 py-1.5 rounded" style={{ background:'rgba(0,0,0,0.3)', border:'1px solid var(--border)', color:'var(--text-primary)' }}>
                  {['all','train','test','validation'].map(s=><option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-xs" style={{ color:'var(--text-secondary)' }}>
                  <input type="checkbox" checked={config.calibrate_detector} onChange={e=>set('calibrate_detector',e.target.checked)} />
                  Calibrate Detector
                </label>
                <label className="flex items-center gap-2 text-xs" style={{ color:'var(--text-secondary)' }}>
                  <input type="checkbox" checked={config.use_label_for_verification} onChange={e=>set('use_label_for_verification',e.target.checked)} />
                  Use Label for Verification
                </label>
              </div>
            </div>
          </div>

          {/* TI weights */}
          <div className="kpi-card">
            <h3 className="text-sm font-semibold mb-3" style={{ color:'var(--text-primary)' }}>TI Weights (must sum to 1.0)</h3>
            <div className="space-y-3">
              {(['ti_weight_hallucination','ti_weight_bias','ti_weight_robustness','ti_weight_decision'] as const).map(k => {
                const label = k.replace('ti_weight_','').charAt(0).toUpperCase() + k.replace('ti_weight_','').slice(1);
                return (
                  <div key={k}>
                    <div className="flex justify-between text-xs mb-1">
                      <span style={{ color:'var(--text-secondary)' }}>{label} weight</span>
                      <span className="font-mono" style={{ color:'#3b82f6' }}>{config[k].toFixed(2)}</span>
                    </div>
                    <input type="range" min={0} max={1} step={0.05} value={config[k]}
                      onChange={e=>set(k,parseFloat(e.target.value))} className="w-full" />
                  </div>
                );
              })}
              <div className="flex justify-between text-xs pt-2 border-t" style={{ borderColor:'var(--border)' }}>
                <span style={{ color:'var(--text-muted)' }}>Sum</span>
                <span className="font-mono font-bold" style={{ color: Math.abs(config.ti_weight_hallucination+config.ti_weight_bias+config.ti_weight_robustness+config.ti_weight_decision-1)<0.01?'#22c55e':'#ef4444' }}>
                  {(config.ti_weight_hallucination+config.ti_weight_bias+config.ti_weight_robustness+config.ti_weight_decision).toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          {error && <div className="text-xs p-2 rounded" style={{ background:'rgba(239,68,68,0.1)', color:'#ef4444', border:'1px solid rgba(239,68,68,0.3)' }}>{error}</div>}
          <button onClick={launch} disabled={launching}
            className="btn-primary w-full py-2 rounded text-sm font-semibold" style={{ opacity:launching?0.6:1 }}>
            {launching ? 'Launching...' : 'Run Experiment (background)'}
          </button>
        </div>

        {/* Status panel */}
        <div className="space-y-4">
          {job && (
            <div className="kpi-card" style={{ borderTop:`2px solid ${statusColor[job.status]??'#64748b'}` }}>
              <div className="flex items-center gap-3 mb-3">
                <span className="badge font-semibold" style={{ background:`${statusColor[job.status]??'#64748b'}20`, color:statusColor[job.status]??'#64748b' }}>
                  {job.status}
                </span>
                <span className="font-mono text-xs" style={{ color:'var(--text-muted)' }}>Job {job.job_id}</span>
                {job.status === 'running' && <span className="text-xs" style={{ color:'#f59e0b' }}>● polling every 4s</span>}
              </div>
              <p className="text-sm" style={{ color:'var(--text-secondary)' }}>{job.message}</p>
              {job.error && <p className="text-xs mt-2" style={{ color:'#ef4444' }}>{job.error}</p>}
              {job.status === 'completed' && (
                <div className="mt-3 p-2 rounded" style={{ background:'rgba(34,197,94,0.1)', border:'1px solid rgba(34,197,94,0.3)' }}>
                  <p className="text-xs" style={{ color:'#22c55e' }}>
                    ✓ Experiment complete. New results are written to <code>outputs/</code>.
                    Refresh the Dashboard and Experiments pages to see updated data.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Config reference */}
          <div className="kpi-card" style={{ borderLeft:'3px solid #64748b' }}>
            <h3 className="text-sm font-semibold mb-3" style={{ color:'var(--text-primary)' }}>Parameter Reference</h3>
            <div className="space-y-2 text-xs" style={{ color:'var(--text-secondary)' }}>
              {[
                ['verification_threshold', '0.0–1.0', 'Min overlap score to pass verification'],
                ['max_revision_attempts', '0–5', 'Max retries when critique finds issues'],
                ['bootstrap_samples', '50–5000', 'Bootstrap CI sample count (higher=more precise)'],
                ['calibrate_detector', 'bool', 'Whether to calibrate hallucination detector from training split'],
                ['use_label_for_verification', 'bool', 'Use gold label as reference during verification'],
              ].map(([p, range, desc]) => (
                <div key={p as string} className="grid grid-cols-3 gap-1">
                  <code style={{ color:'#93c5fd' }}>{p}</code>
                  <span style={{ color:'var(--text-muted)' }}>{range}</span>
                  <span>{desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
