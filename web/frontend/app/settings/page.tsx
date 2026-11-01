'use client';
import { useEffect, useState } from 'react';
const API = 'http://localhost:8080';

export default function SettingsPage() {
  const [backendUrl, setBackendUrl] = useState('http://localhost:8080');
  const [wsStatus, setWsStatus] = useState<'checking'|'ok'|'error'>('checking');
  const [health, setHealth] = useState<{status:string;project_root:string}|null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch(`${backendUrl}/api/health`).then(r=>r.json()).then(h=>{setHealth(h);setWsStatus('ok');}).catch(()=>setWsStatus('error'));
  }, []);

  function checkConnection() {
    setWsStatus('checking');
    fetch(`${backendUrl}/api/health`).then(r=>r.json()).then(h=>{setHealth(h);setWsStatus('ok');}).catch(()=>setWsStatus('error'));
  }

  const statusBadge = {
    checking: { label:'Checking...', color:'#f59e0b' },
    ok: { label:'Connected', color:'#22c55e' },
    error: { label:'Unreachable', color:'#ef4444' },
  }[wsStatus];

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold" style={{ color:'var(--text-primary)' }}>Settings</h2>
        <p className="text-sm mt-1" style={{ color:'var(--text-muted)' }}>Platform configuration and connectivity diagnostics.</p>
      </div>

      {/* Backend connection */}
      <div className="kpi-card mb-6">
        <h3 className="text-sm font-semibold mb-4" style={{ color:'var(--text-primary)' }}>Backend Connection</h3>
        <div className="flex gap-3 items-center mb-3">
          <input type="text" value={backendUrl} onChange={e=>setBackendUrl(e.target.value)}
            className="flex-1 text-xs px-3 py-1.5 rounded font-mono" style={{ background:'rgba(0,0,0,0.3)', border:'1px solid var(--border)', color:'var(--text-primary)' }} />
          <button onClick={checkConnection} className="btn-primary px-4 py-1.5 rounded text-xs">Test</button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold" style={{ color:statusBadge.color }}>● {statusBadge.label}</span>
          {health && <span className="text-xs" style={{ color:'var(--text-muted)' }}>Project root: {health.project_root}</span>}
        </div>
      </div>

      {/* API endpoints reference */}
      <div className="kpi-card mb-6">
        <h3 className="text-sm font-semibold mb-3" style={{ color:'var(--text-primary)' }}>API Endpoints Reference</h3>
        <div className="space-y-1">
          {[
            ['GET', '/api/health', 'Health check + project root'],
            ['GET', '/api/dashboard', 'Dashboard KPIs'],
            ['GET', '/api/deep-learning/models', '20-model results'],
            ['GET', '/api/deep-learning/history/all', 'Training curves'],
            ['GET', '/api/deep-learning/confusion', 'Confusion matrices'],
            ['POST', '/api/deep-learning/train', 'Launch background training'],
            ['GET', '/api/fuzzy/gate-results', 'Fuzzy gate per algorithm'],
            ['GET', '/api/fuzzy/action-distribution', 'Action distribution'],
            ['GET', '/api/fuzzy/membership-curves/{type}', 'MF curve data'],
            ['POST', '/api/fuzzy/evaluate', 'Live fuzzy evaluation'],
            ['GET', '/api/experiments', 'List experiment runs'],
            ['GET', '/api/experiments/{id}/condition-metrics', 'Condition metrics'],
            ['GET', '/api/experiments/{id}/statistical-tests', 'Statistical tests'],
            ['POST', '/api/experiments/run', 'Launch experiment'],
            ['GET', '/api/system', 'System stats (CPU/RAM/disk)'],
            ['WS', '/ws', 'Live system stats stream'],
            ['GET', '/graph/**', 'Static PNG charts'],
            ['GET', '/docs', 'Interactive Swagger UI'],
          ].map(([method, path, desc])=>(
            <div key={path as string} className="flex gap-2 py-1 text-xs border-b" style={{ borderColor:'rgba(255,255,255,0.04)' }}>
              <span className="font-mono font-bold w-10 flex-shrink-0" style={{ color:method==='GET'?'#22c55e':method==='POST'?'#3b82f6':method==='WS'?'#a855f7':'#f59e0b' }}>{method}</span>
              <code style={{ color:'#93c5fd' }}>{path}</code>
              <span style={{ color:'var(--text-muted)', marginLeft:'auto', flexShrink:0 }}>{desc}</span>
            </div>
          ))}
        </div>
        <div className="mt-3">
          <a href={`${backendUrl}/docs`} target="_blank" rel="noopener noreferrer"
            className="btn-primary text-xs px-3 py-1.5 rounded inline-block">
            Open Swagger UI →
          </a>
        </div>
      </div>

      {/* Platform info */}
      <div className="kpi-card">
        <h3 className="text-sm font-semibold mb-3" style={{ color:'var(--text-primary)' }}>Platform Information</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs" style={{ color:'var(--text-secondary)' }}>
          {[
            ['Frontend', 'Next.js 14 + TypeScript + Tailwind CSS'],
            ['Charts', 'Plotly.js via react-plotly.js'],
            ['Backend', 'FastAPI + uvicorn + psutil'],
            ['Python', '3.14.2 (existing venv)'],
            ['Data Sources', 'CSV + JSONL + JSON (no database)'],
            ['Integrity', 'Read-only — no project files modified'],
          ].map(([k,v])=>(
            <div key={k} className="p-2 rounded" style={{ background:'rgba(255,255,255,0.02)' }}>
              <div className="font-semibold mb-0.5" style={{ color:'var(--text-primary)' }}>{k}</div>
              <div>{v}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
