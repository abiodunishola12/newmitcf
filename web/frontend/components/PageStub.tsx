import { Construction } from 'lucide-react';

export default function PageStub({ title, description, stage }: {
  title: string;
  description: string;
  stage: string;
}) {
  return (
    <div className="max-w-2xl">
      <div className="kpi-card">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ background: 'rgba(245,158,11,0.15)' }}>
            <Construction size={20} style={{ color: '#f59e0b' }} />
          </div>
          <div>
            <h2 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>{title}</h2>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Planned for {stage}</p>
          </div>
        </div>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{description}</p>
        <div className="mt-4 p-3 rounded-lg" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
          <p className="text-xs" style={{ color: '#f59e0b' }}>
            This page will be implemented in Stage {stage} of the web platform development.
            The underlying data and algorithms are already present in the MITCF project.
          </p>
        </div>
      </div>
    </div>
  );
}
