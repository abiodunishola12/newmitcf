'use client';

import { Menu, Wifi, WifiOff } from 'lucide-react';
import { useEffect, useState } from 'react';

interface SystemStats {
  cpu_percent: number;
  memory_percent: number;
  memory_used_gb: number;
}

export default function TopBar({
  onToggleSidebar,
  title,
}: {
  onToggleSidebar: () => void;
  title: string;
}) {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const ws = new WebSocket('ws://localhost:8000/ws');
    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'system_stats') {
          setStats({ cpu_percent: data.cpu_percent, memory_percent: data.memory_percent, memory_used_gb: data.memory_used_gb });
        }
      } catch {}
    };
    return () => ws.close();
  }, []);

  return (
    <header
      className="fixed top-0 right-0 left-0 z-30 flex items-center justify-between px-4"
      style={{ height: 56, background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}
    >
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="p-2 rounded-lg hover:bg-opacity-20 hover:bg-white transition-all"
          style={{ color: 'var(--text-secondary)' }}
        >
          <Menu size={18} />
        </button>
        <h1 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</h1>
      </div>

      <div className="flex items-center gap-4">
        {stats && (
          <>
            <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
              <span>CPU</span>
              <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-hover)' }}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${stats.cpu_percent}%`, background: stats.cpu_percent > 80 ? 'var(--danger)' : 'var(--accent)' }}
                />
              </div>
              <span>{stats.cpu_percent.toFixed(0)}%</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
              <span>RAM</span>
              <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-hover)' }}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${stats.memory_percent}%`, background: stats.memory_percent > 85 ? 'var(--danger)' : 'var(--success)' }}
                />
              </div>
              <span>{stats.memory_percent.toFixed(0)}%</span>
            </div>
          </>
        )}
        <div className="flex items-center gap-1 text-xs" style={{ color: connected ? 'var(--success)' : 'var(--text-muted)' }}>
          {connected ? <Wifi size={12} /> : <WifiOff size={12} />}
          <span>{connected ? 'Live' : 'Offline'}</span>
        </div>
      </div>
    </header>
  );
}
