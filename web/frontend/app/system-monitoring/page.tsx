'use client';

import { useEffect, useState, useRef } from 'react';
import dynamic from 'next/dynamic';

const Plot = dynamic(() => import('react-plotly.js'), { ssr: false });
const API = 'http://localhost:8080';

interface SystemData {
  cpu: { percent: number; count_logical: number; count_physical: number };
  memory: { total_gb: number; used_gb: number; available_gb: number; percent: number };
  disk: { total_gb: number; used_gb: number; free_gb: number; percent: number };
  gpu: { available: boolean; note?: string; devices?: Array<{ name: string; memory_total_gb: number; memory_used_gb: number; gpu_utilization_percent: number }> };
  platform: { system: string; version: string; machine: string; processor: string; python: string };
  project: { root: string; outputs_count: number };
}

export default function SystemMonitoringPage() {
  const [systemData, setSystemData] = useState<SystemData | null>(null);
  const [cpuHistory, setCpuHistory] = useState<number[]>([]);
  const [ramHistory, setRamHistory] = useState<number[]>([]);
  const [timeHistory, setTimeHistory] = useState<string[]>([]);

  useEffect(() => {
    fetch(`${API}/api/system`).then((r) => r.json()).then(setSystemData);

    const ws = new WebSocket('ws://localhost:8080/ws');
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'system_stats') {
          const time = new Date(data.timestamp * 1000).toLocaleTimeString();
          setCpuHistory((prev) => [...prev.slice(-59), data.cpu_percent]);
          setRamHistory((prev) => [...prev.slice(-59), data.memory_percent]);
          setTimeHistory((prev) => [...prev.slice(-59), time]);
        }
      } catch {}
    };
    return () => ws.close();
  }, []);

  const plotLayout = {
    paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
    margin: { t: 10, l: 45, r: 10, b: 35 },
    xaxis: { color: '#94a3b8', showticklabels: false },
    yaxis: { color: '#94a3b8', range: [0, 100] },
    font: { color: '#94a3b8', size: 11 },
    height: 140,
  };

  const pct = (v: number) => `${v.toFixed(1)}%`;

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>GPU and System Monitoring</h2>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Real-time CPU, RAM, and platform information</p>
      </div>

      {/* Live Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="kpi-card">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>CPU Usage (Live)</h3>
            <span className="text-lg font-bold" style={{ color: 'var(--accent)' }}>
              {cpuHistory.length ? pct(cpuHistory[cpuHistory.length - 1]) : '—'}
            </span>
          </div>
          <Plot
            data={[{ type: 'scatter', mode: 'lines', x: timeHistory, y: cpuHistory, fill: 'tozeroy', line: { color: '#3b82f6', width: 1.5 }, fillcolor: 'rgba(59,130,246,0.15)' }]}
            layout={plotLayout} config={{ displayModeBar: false }} style={{ width: '100%' }} />
        </div>
        <div className="kpi-card">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>RAM Usage (Live)</h3>
            <span className="text-lg font-bold" style={{ color: 'var(--success)' }}>
              {ramHistory.length ? pct(ramHistory[ramHistory.length - 1]) : '—'}
            </span>
          </div>
          <Plot
            data={[{ type: 'scatter', mode: 'lines', x: timeHistory, y: ramHistory, fill: 'tozeroy', line: { color: '#22c55e', width: 1.5 }, fillcolor: 'rgba(34,197,94,0.15)' }]}
            layout={plotLayout} config={{ displayModeBar: false }} style={{ width: '100%' }} />
        </div>
      </div>

      {systemData && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Memory */}
          <div className="kpi-card">
            <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Memory</h3>
            <div className="space-y-3">
              {[
                { label: 'Total', value: systemData.memory.total_gb, suffix: 'GB' },
                { label: 'Used', value: systemData.memory.used_gb, suffix: 'GB' },
                { label: 'Available', value: systemData.memory.available_gb, suffix: 'GB' },
              ].map((item) => (
                <div key={item.label} className="flex justify-between text-sm">
                  <span style={{ color: 'var(--text-muted)' }}>{item.label}</span>
                  <span style={{ color: 'var(--text-primary)' }}>{item.value} {item.suffix}</span>
                </div>
              ))}
              <div className="mt-2">
                <div className="flex justify-between text-xs mb-1">
                  <span style={{ color: 'var(--text-muted)' }}>Usage</span>
                  <span style={{ color: 'var(--text-primary)' }}>{pct(systemData.memory.percent)}</span>
                </div>
                <div className="w-full h-2 rounded-full" style={{ background: 'var(--bg-hover)' }}>
                  <div className="h-full rounded-full" style={{ width: `${systemData.memory.percent}%`, background: 'var(--success)' }} />
                </div>
              </div>
            </div>
          </div>

          {/* Platform */}
          <div className="kpi-card">
            <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Platform</h3>
            <div className="space-y-2">
              {[
                { label: 'OS', value: systemData.platform.system },
                { label: 'CPU', value: systemData.platform.processor },
                { label: 'Architecture', value: systemData.platform.machine },
                { label: 'Python', value: systemData.platform.python.split(' ')[0] },
                { label: 'CPU Cores (logical)', value: String(systemData.cpu.count_logical) },
                { label: 'CPU Cores (physical)', value: String(systemData.cpu.count_physical) },
                { label: 'Disk Free', value: `${systemData.disk.free_gb} GB / ${systemData.disk.total_gb} GB` },
                { label: 'Experiment Runs', value: String(systemData.project.outputs_count) },
              ].map((item) => (
                <div key={item.label} className="flex justify-between text-xs">
                  <span style={{ color: 'var(--text-muted)' }}>{item.label}</span>
                  <span className="font-mono max-w-xs text-right truncate" style={{ color: 'var(--text-secondary)' }}>{item.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* GPU */}
          <div className="kpi-card lg:col-span-2">
            <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>GPU</h3>
            {systemData.gpu.available ? (
              <div>
                {(systemData.gpu.devices || []).map((d) => (
                  <div key={d.name} className="p-3 rounded-lg" style={{ background: 'var(--bg-hover)' }}>
                    <p className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>{d.name}</p>
                    <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                      Memory: {d.memory_used_gb} / {d.memory_total_gb} GB · GPU Utilisation: {d.gpu_utilization_percent}%
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-3 rounded-lg" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
                <p className="text-sm" style={{ color: '#f59e0b' }}>
                  {systemData.gpu.note || 'NVIDIA GPU monitoring not available.'}
                </p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                  Note: This MITCF implementation uses pure Python CPU computation only. Install pynvml to enable NVIDIA monitoring.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
