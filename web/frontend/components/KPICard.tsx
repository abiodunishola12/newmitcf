import { LucideIcon } from 'lucide-react';

interface KPICardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: LucideIcon;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  color?: 'blue' | 'green' | 'yellow' | 'red' | 'purple';
}

const colorMap = {
  blue: { icon: 'rgba(59,130,246,0.2)', iconText: '#3b82f6' },
  green: { icon: 'rgba(34,197,94,0.2)', iconText: '#22c55e' },
  yellow: { icon: 'rgba(245,158,11,0.2)', iconText: '#f59e0b' },
  red: { icon: 'rgba(239,68,68,0.2)', iconText: '#ef4444' },
  purple: { icon: 'rgba(168,85,247,0.2)', iconText: '#a855f7' },
};

export default function KPICard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  trendValue,
  color = 'blue',
}: KPICardProps) {
  const colors = colorMap[color];
  return (
    <div className="kpi-card">
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
          {title}
        </p>
        {Icon && (
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: colors.icon }}
          >
            <Icon size={16} style={{ color: colors.iconText }} />
          </div>
        )}
      </div>
      <div className="flex items-end gap-2">
        <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          {value}
        </p>
        {trend && trendValue && (
          <span
            className="text-xs font-medium mb-0.5"
            style={{ color: trend === 'up' ? 'var(--success)' : trend === 'down' ? 'var(--danger)' : 'var(--text-muted)' }}
          >
            {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '—'} {trendValue}
          </span>
        )}
      </div>
      {subtitle && (
        <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
          {subtitle}
        </p>
      )}
    </div>
  );
}
