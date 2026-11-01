'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';

const API = 'http://localhost:8080';

const MME_CATEGORIES = [
  { id: 'existence', group: 'Perception' }, { id: 'count', group: 'Perception' },
  { id: 'position', group: 'Perception' }, { id: 'color', group: 'Perception' },
  { id: 'posters', group: 'Perception' }, { id: 'celebrity', group: 'Perception' },
  { id: 'scene', group: 'Perception' }, { id: 'landmark', group: 'Perception' },
  { id: 'artwork', group: 'Perception' }, { id: 'OCR', group: 'Perception' },
  { id: 'commonsense_reasoning', group: 'Cognition' },
  { id: 'numerical_calculation', group: 'Cognition' },
  { id: 'text_translation', group: 'Cognition' },
  { id: 'code_reasoning', group: 'Cognition' },
];
const PERCEPTION_CATS = MME_CATEGORIES.filter(c => c.group === 'Perception').map(c => c.id);
const COGNITION_CATS = MME_CATEGORIES.filter(c => c.group === 'Cognition').map(c => c.id);

const CONDITIONS = ['baseline', 'revision_only', 'fixed_gate', 'full_mitcf'];
const COND_COLORS: Record<string, string> = {
  baseline: '#64748b', revision_only: '#f59e0b',
  fixed_gate: '#3b82f6', full_mitcf: '#22c55e',
};
const COND_LABELS: Record<string, string> = {
  baseline: 'Baseline', revision_only: 'Revision Only',
  fixed_gate: 'Fixed Gate', full_mitcf: 'Full MITCF',
};

interface Run { run_id: string; created_at: string; }

export default function VPMMEPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [selectedRun, setSelectedRun] = useState('');
  const [catMetrics, setCatMetrics] = useState<Array<Record<string, string>>>([]);
  const [benchMetrics, setBenchMetrics] = useState<Array<Record<string, string>>>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    fetch(`${API}/api/visual-perception/runs`).then(r => r.json())
      .then((data: Run[]) => { setRuns(data); if (data.length > 0) setSelectedRun(data[0].run_id); })
      .catch(e => setErr(String(e)));
  }, []);

  useEffect(() => {
    if (!selectedRun) return;
    setLoading(true);
    Promise.all([
      fetch(`${API}/api/visual-perception/runs/${selectedRun}/category-metrics`).then(r => r.json()),
      fetch(`${API}/api/visual-perception/runs/${selectedRun}/benchmark-metrics`).then(r => r.json()),
    ]).then(([cats, bench]) => {
      setCatMetrics((cats as Array<Record<string, string>>).filter(r => r.benchmark === 'mme' || r.benchmark === undefined));
      setBenchMetrics((bench as Array<Record<string, string>>).filter(r => r.benchmark === 'mme' || r.benchmark === undefined));
    }).catch(e => setErr(String(e)))
      .finally(() => setLoading(false));
  }, [selectedRun]);

  // Lookup: category â†’ condition â†’ row
  const byCategory: Record<string, Record<string, Record<string, string>>> = {};
  catMetrics.forEach(row => {
    const cat = row.category ?? '';
    const cond = row.condition ?? '';
    if (!byCategory[cat]) byCategory[cat] = {};
    byCategory[cat][cond] = row;
  });
  // Overall MME score from benchmark metrics
  const mmeOverall: Record<string, Record<string, string>> = {};
  benchMetrics.forEach(row => {
    mmeOverall[row.condition ?? ''] = row;
  });

  function mmeScore(row: Record<string, string> | undefined): string {
    if (!row) return 'â€”';
    const s = row.mme_score ?? row.score;
    if (!s) return 'â€”';
    const n = parseFloat(s);
    return isNaN(n) ? s : n.toFixed(1);
  }
  function pct(v: string | undefined) {
    if (!v) return 'â€”';
    const n = parseFloat(v);
    return isNaN(n) ? v : (n * 100).toFixed(1) + '%';
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>MME Perception Evaluation</h2>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
          Multi-modal Model Evaluation â€” 14 categories (10 perception + 4 cognition).
          Official scoring: accuracyÃ—100 + plus_scoreÃ—100 per category.
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
                  border: '1px solid var(--border)',
                }}>
                {r.run_id}
              </button>
            ))}
          </div>
        </div>
      )}

      {runs.length === 0 && !err && (
        <div className="kpi-card text-center py-8">
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No VP runs found.</p>
          <Link href="/visual-perception/run" style={{ color: 'var(--accent)' }} className="text-sm mt-2 block">Launch evaluation â†’</Link>
        </div>
      )}

      {loading && <div className="text-xs mt-4" style={{ color: 'var(--text-muted)' }}>Loading MME metricsâ€¦</div>}

      {/* Overall MME scores */}
      {!loading && Object.keys(mmeOverall).length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {CONDITIONS.map(c => (
            <div key={c} className="kpi-card text-center" style={{ borderTop: `2px solid ${COND_COLORS[c]}` }}>
              <div className="text-xs font-bold" style={{ color: COND_COLORS[c] }}>{COND_LABELS[c]}</div>
              <div className="text-2xl font-bold mt-1" style={{ color: 'var(--text-primary)' }}>
                {mmeScore(mmeOverall[c])}
              </div>
              <div className="text-xs" style={{ color: 'var(--text-muted)' }}>total MME score</div>
            </div>
          ))}
        </div>
      )}

      {/* Category tables by group */}
      {[{ label: 'Perception Tasks', cats: PERCEPTION_CATS }, { label: 'Cognition Tasks', cats: COGNITION_CATS }].map(group => (
        <div key={group.label} className="kpi-card mb-4 overflow-x-auto">
          <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>{group.label}</h3>
          <table className="w-full text-xs" style={{ borderCollapse: 'collapse', minWidth: 500 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                <th className="text-left py-2 pr-4">Category</th>
                {CONDITIONS.map(c => (
                  <th key={c} className="text-right py-2 pr-4" style={{ color: COND_COLORS[c] }}>{COND_LABELS[c]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {group.cats.map(cat => (
                <tr key={cat} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td className="py-2 pr-4 capitalize" style={{ color: 'var(--text-secondary)' }}>{cat.replace(/_/g, ' ')}</td>
                  {CONDITIONS.map(c => {
                    const row = byCategory[cat]?.[c];
                    return (
                      <td key={c} className="py-2 pr-4 text-right font-mono" style={{ color: 'var(--text-primary)' }}>
                        {mmeScore(row)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      <div className="kpi-card" style={{ borderLeft: '3px solid #06b6d4' }}>
        <h4 className="text-xs font-semibold mb-2" style={{ color: '#06b6d4' }}>MME Scoring</h4>
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          Official MME score per category = accuracyÃ—100 + plus_scoreÃ—100, where plus_score credits
          image pairs where <em>both</em> questions are answered correctly. Total score is the sum across
          all categories (max ~3,000 for 14 categories at perfect accuracy with all pairs correct).
        </p>
      </div>
    </div>
  );
}
