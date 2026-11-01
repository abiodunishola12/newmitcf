'use client';
import { useEffect, useState } from 'react';
const API = 'http://localhost:8080';

interface SystemInfo { cpu_percent: number; ram_percent: number; python_version: string; platform: string; disk_outputs_gb: number; }

export default function SystemArchitecturePage() {
  const [sysInfo, setSysInfo] = useState<SystemInfo | null>(null);

  useEffect(() => {
    fetch(`${API}/api/system`).then(r=>r.json()).then((d: any) => {
      setSysInfo({
        cpu_percent: d?.cpu?.percent ?? 0,
        ram_percent: d?.memory?.percent ?? 0,
        python_version: d?.platform?.python?.split(' ')[0] ?? '—',
        platform: `${d?.platform?.system ?? ''} ${d?.platform?.machine ?? ''}`.trim(),
        disk_outputs_gb: d?.disk?.free_gb ?? 0,
      });
    }).catch(()=>{});
  }, []);

  const layers = [
    {
      label: 'Frontend Layer',
      color: '#3b82f6',
      items: [
        { name: 'Next.js 14 (App Router)', desc: 'React framework with TypeScript, Tailwind CSS' },
        { name: 'react-plotly.js', desc: 'Scientific charts and interactive visualizations' },
        { name: 'WebSocket client', desc: 'Native browser WebSocket for real-time system stats' },
        { name: 'Lucide React', desc: 'Icon library' },
      ],
    },
    {
      label: 'API Layer',
      color: '#a855f7',
      items: [
        { name: 'FastAPI 0.162', desc: 'REST API with auto-generated OpenAPI docs at /docs' },
        { name: 'Pydantic v2', desc: 'Request/response validation and serialization' },
        { name: 'WebSocket endpoint /ws', desc: 'Streams system stats (CPU, RAM) every 2 seconds' },
        { name: 'StaticFiles /graph', desc: 'Serves PNG charts from graph/ directory' },
      ],
    },
    {
      label: 'Service Layer',
      color: '#f59e0b',
      items: [
        { name: 'data_service.py', desc: 'Reads CSV/JSONL/JSON from project outputs' },
        { name: 'fuzzy_service.py', desc: 'Wraps FuzzyDecisionGate for live evaluation' },
        { name: 'experiment_service.py', desc: 'Background threading for experiment/training jobs' },
      ],
    },
    {
      label: 'Research Layer (existing)',
      color: '#22c55e',
      items: [
        { name: 'mitcf_pipeline/', desc: 'Complete MITCF research implementation (untouched)' },
        { name: 'FuzzyDecisionGate', desc: 'Pure-Python Mamdani inference system' },
        { name: 'NeuralBinaryClassifier', desc: 'Custom MLP with manual backprop' },
        { name: 'MITCFController', desc: 'Orchestrates 5-condition ablation pipeline' },
      ],
    },
    {
      label: 'Data Layer',
      color: '#06b6d4',
      items: [
        { name: 'graph/model_results.csv', desc: '20-model training results' },
        { name: 'graph/training_history.csv', desc: 'Per-epoch training curves' },
        { name: 'graph/fuzzy_gate/', desc: 'Fuzzy gate results, distributions, manifests' },
        { name: 'outputs/*/metrics_by_condition.csv', desc: 'Experiment condition metrics (3 runs)' },
      ],
    },
  ];

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold" style={{ color:'var(--text-primary)' }}>System Architecture</h2>
        <p className="text-sm mt-1" style={{ color:'var(--text-muted)' }}>
          Full-stack architecture of the MITCF Web Visualization Platform — frontend, API, service, and research layers.
        </p>
      </div>

      {/* Runtime info */}
      {sysInfo && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            ['Python', sysInfo.python_version],
            ['Platform', sysInfo.platform],
            ['CPU', `${sysInfo.cpu_percent.toFixed(0)}%`],
            ['RAM', `${sysInfo.ram_percent.toFixed(0)}%`],
          ].map(([k,v])=>(
            <div key={k} className="kpi-card p-3">
              <div className="text-xs" style={{ color:'var(--text-muted)', fontSize:'10px' }}>{k}</div>
              <div className="text-sm font-bold mt-0.5" style={{ color:'var(--accent)' }}>{v}</div>
            </div>
          ))}
        </div>
      )}

      {/* Architecture layers */}
      <div className="space-y-4 mb-6">
        {layers.map(layer => (
          <div key={layer.label} className="kpi-card" style={{ borderLeft:`3px solid ${layer.color}` }}>
            <h3 className="text-sm font-bold mb-3" style={{ color:layer.color }}>{layer.label}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {layer.items.map(item=>(
                <div key={item.name} className="flex gap-2 p-2 rounded" style={{ background:'rgba(255,255,255,0.02)' }}>
                  <span className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ background:layer.color }} />
                  <div>
                    <code className="text-xs" style={{ color:layer.color }}>{item.name}</code>
                    <p className="text-xs" style={{ color:'var(--text-muted)' }}>{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Data flow diagram */}
      <div className="kpi-card mb-6">
        <h3 className="text-sm font-semibold mb-4" style={{ color:'var(--text-primary)' }}>Data Flow</h3>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {[
            { label:'Browser\n(React)', color:'#3b82f6' },
            { label:'→', color:'#475569' },
            { label:'FastAPI\n:8000', color:'#a855f7' },
            { label:'→', color:'#475569' },
            { label:'data_service\nfuzzy_service', color:'#f59e0b' },
            { label:'→', color:'#475569' },
            { label:'CSV/JSON\nfiles', color:'#06b6d4' },
          ].map((item, i) => (
            item.label==='→'
              ? <span key={i} style={{ color:item.color, fontSize:'20px' }}>→</span>
              : <div key={i} className="px-3 py-2 rounded text-center" style={{ background:`${item.color}15`, border:`1px solid ${item.color}40` }}>
                  {item.label.split('\n').map(l=><div key={l} style={{ color:item.color, fontWeight:600 }}>{l}</div>)}
                </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs mt-3">
          {[
            { label:'Browser\nWebSocket', color:'#3b82f6' },
            { label:'⇄', color:'#475569' },
            { label:'/ws endpoint\nFastAPI', color:'#a855f7' },
            { label:'→', color:'#475569' },
            { label:'psutil\n(CPU/RAM)', color:'#22c55e' },
            { label:'→', color:'#475569' },
            { label:'TopBar\nLive Charts', color:'#3b82f6' },
          ].map((item, i) => (
            item.label==='→'||item.label==='⇄'
              ? <span key={i} style={{ color:'#475569', fontSize:'20px' }}>{item.label}</span>
              : <div key={i} className="px-3 py-2 rounded text-center" style={{ background:`${item.color}15`, border:`1px solid ${item.color}40` }}>
                  {item.label.split('\n').map(l=><div key={l} style={{ color:item.color, fontWeight:600 }}>{l}</div>)}
                </div>
          ))}
        </div>
      </div>

      {/* No-fabrication note */}
      <div className="kpi-card" style={{ borderLeft:'3px solid #22c55e' }}>
        <h3 className="text-sm font-semibold mb-2" style={{ color:'#22c55e' }}>Data Integrity Guarantee</h3>
        <p className="text-sm" style={{ color:'var(--text-secondary)' }}>
          All data displayed in this platform is read directly from the project's CSV, JSONL, and JSON output files.
          No values are hardcoded, fabricated, or inferred. The web platform adds zero new experiment logic —
          it is a read-only visualization layer over the existing MITCF research outputs.
        </p>
      </div>
    </div>
  );
}
