'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';

const API = 'http://localhost:8080';

const CONDITIONS = ['baseline', 'revision_only', 'fixed_gate', 'full_mitcf'];
const COND_COLORS: Record<string, string> = {
  baseline: '#64748b', revision_only: '#f59e0b',
  fixed_gate: '#3b82f6', full_mitcf: '#22c55e',
};
const COND_LABELS: Record<string, string> = {
  baseline: 'Baseline', revision_only: 'Revision Only',
  fixed_gate: 'Fixed Gate', full_mitcf: 'Full MITCF',
};

const PERTURBATIONS = [
  { id: 'gaussian_noise', label: 'Gaussian Noise', desc: 'Additive zero-mean Gaussian noise' },
  { id: 'gaussian_blur', label: 'Gaussian Blur', desc: 'Spatial smoothing blur' },
  { id: 'brightness', label: 'Brightness', desc: 'Image brightness scaling' },
  { id: 'contrast', label: 'Contrast', desc: 'Local contrast adjustment' },
  { id: 'jpeg_compression', label: 'JPEG Compression', desc: 'Lossy JPEG round-trip' },
  { id: 'resolution_degradation', label: 'Resolution Degradation', desc: 'Bicubic downscale and upscale' },
];

interface Run { run_id: string; has_robustness: boolean; created_at: string; }

export default function VPRobustnessPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [selectedRun, setSelectedRun] = useState('');
  const [robustRows, setRobustRows] = useState<Array<Record<string, string>>>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    fetch(`${API}/api/visual-perception/runs`).then(r => r.json())
      .then((data: Run[]) => {
        setRuns(data);
        const withRobust = data.find((r: Run) => r.has_robustness);
        if (withRobust) setSelectedRun(withRobust.run_id);
        else if (data.length > 0) setSelectedRun(data[0].run_id);
      }).catch(e => setErr(String(e)));
  }, []);

  useEffect(() => {
    if (!selectedRun) return;
    setLoading(true); setRobustRows([]);
    fetch(`${API}/api/visual-perception/runs/${selectedRun}/robustness`)
      .then(r => r.json()).then(setRobustRows)
      .catch(e => setErr(String(e)))
      .finally(() => setLoading(false));
  }, [selectedRun]);

  // Group: perturbation â†’ severity â†’ condition â†’ row
  const byPertSevCond: Record<string, Record<string, Record<string, Record<string, string>>>> = {};
  robustRows.forEach(row => {
    const p = row.perturbation_type ?? '';
    const s = row.severity ?? '';
    const c = row.condition ?? '';
    if (!byPertSevCond[p]) byPertSevCond[p] = {};
    if (!byPertSevCond[p][s]) byPertSevCond[p][s] = {};
    byPertSevCond[p][s][c] = row;
  });

  function pct(v: string | undefined) {
    if (!v) return 'â€”';
    const n = parseFloat(v);
    return isNaN(n) ? v : (n * 100).toFixed(1) + '%';
  }

  const selectedRunObj = runs.find(r => r.run_id === selectedRun);

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>VP Adversarial Robustness</h2>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
          Six image perturbation types at multiple severity levels. Measures accuracy degradation
          under distribution shift. Run <code>visual_perception.cli robustness</code> to generate these results.
        </p>
      </div>

      {err && <div className="text-xs mb-4 p-2 rounded" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>{err}</div>}

      {runs.length > 0 && (
        <div className="kpi-card mb-4">
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Run:</span>
            {runs.map(r => (
              <button key={r.run_id} onClick={() => setSelectedRun(r.run_id)}
                className="text-xs px-3 py-1 rounded font-mono"
                style={{
                  background: selectedRun === r.run_id ? 'var(--accent)' : 'rgba(0,0,0,0.3)',
                  color: selectedRun === r.run_id ? 'white' : 'var(--text-secondary)',
                  border: `1px solid ${r.has_robustness ? 'var(--accent)' : 'var(--border)'}`,
                }}>
                {r.run_id} {r.has_robustness ? 'âœ“' : ''}
              </button>
            ))}
          </div>
          {selectedRunObj && !selectedRunObj.has_robustness && (
            <div className="mt-3 text-xs p-2 rounded" style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' }}>
              This run has no robustness results. Run{' '}
              <Link href="/visual-perception/run" style={{ color: '#f59e0b' }}>
                visual_perception.cli robustness
              </Link> to generate them.
            </div>
          )}
        </div>
      )}

      {runs.length === 0 && !err && (
        <div className="kpi-card text-center py-8">
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No VP runs found.</p>
          <Link href="/visual-perception/run" style={{ color: 'var(--accent)' }} className="text-sm mt-2 block">Launch evaluation â†’</Link>
        </div>
      )}

      {loading && <div className="text-xs mt-4" style={{ color: 'var(--text-muted)' }}>Loading robustness dataâ€¦</div>}

      {!loading && robustRows.length === 0 && selectedRun && (
        <div className="kpi-card text-center py-6 mt-4">
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No robustness results for this run.</p>
        </div>
      )}

      {/* Per-perturbation tables */}
      {PERTURBATIONS.map(pert => {
        const data = byPertSevCond[pert.id];
        if (!data) return null;
        const severities = Object.keys(data).sort((a, b) => parseFloat(a) - parseFloat(b));
        return (
          <div key={pert.id} className="kpi-card mb-4">
            <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>{pert.label}</h3>
            <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>{pert.desc}</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs" style={{ borderCollapse: 'collapse', minWidth: 400 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                    <th className="text-left py-2 pr-4">Severity</th>
                    {CONDITIONS.map(c => (
                      <th key={c} className="text-right py-2 pr-4" style={{ color: COND_COLORS[c] }}>{COND_LABELS[c]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {severities.map(sev => (
                    <tr key={sev} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td className="py-2 pr-4 font-mono" style={{ color: 'var(--text-secondary)' }}>{sev}</td>
                      {CONDITIONS.map(c => {
                        const row = data[sev]?.[c];
                        return (
                          <td key={c} className="py-2 pr-4 text-right font-mono" style={{ color: 'var(--text-primary)' }}>
                            {pct(row?.accuracy)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {/* Perturbation descriptions */}
      <div className="kpi-card" style={{ borderLeft: '3px solid #ef4444' }}>
        <h4 className="text-xs font-semibold mb-2" style={{ color: '#ef4444' }}>Perturbation Details</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {PERTURBATIONS.map(p => (
            <div key={p.id} className="text-xs">
              <code style={{ color: '#93c5fd' }}>{p.id}</code>
              <span style={{ color: 'var(--text-secondary)' }}> â€” {p.desc}</span>
            </div>
          ))}
        </div>
        <p className="text-xs mt-3" style={{ color: 'var(--text-muted)' }}>
          Each perturbation is reproducible via a fixed seed. Severity 0 = identity (no change).
          All perturbations preserve RGB format and original image dimensions.
        </p>
      </div>
    </div>
  );
}
