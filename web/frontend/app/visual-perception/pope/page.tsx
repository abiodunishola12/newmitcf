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
const POPE_CATEGORIES = ['random', 'popular', 'adversarial'];

interface Run { run_id: string; created_at: string; }

export default function VPPOPEPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [selectedRun, setSelectedRun] = useState('');
  const [categoryMetrics, setCategoryMetrics] = useState<Array<Record<string, string>>>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    fetch(`${API}/api/visual-perception/runs`).then(r => r.json())
      .then((data: unknown) => { const rows = Array.isArray(data) ? (data as Run[]) : []; setRuns(rows); if (rows.length > 0) setSelectedRun(rows[0].run_id); })
      .catch((e: unknown) => setErr(String(e)));
  }, []);

  useEffect(() => {
    if (!selectedRun) return;
    setLoading(true); setCategoryMetrics([]);
    fetch(`${API}/api/visual-perception/runs/${selectedRun}/category-metrics`)
      .then(r => r.json())
      .then((data: unknown) => {
        const rows = Array.isArray(data) ? (data as Array<Record<string, string>>) : [];
        setCategoryMetrics(rows.filter(r => r.benchmark === 'pope' || !r.benchmark));
      }).catch((e: unknown) => setErr(String(e)))
      .finally(() => setLoading(false));
  }, [selectedRun]);

  function pct(v: string | undefined) {
    if (!v) return 'â€"';
    const n = parseFloat(v);
    return isNaN(n) ? v : (n * 100).toFixed(1) + '%';
  }

  // Group by category
  const byCategory: Record<string, Record<string, Record<string, string>>> = {};
  categoryMetrics.forEach(row => {
    const cat = row.category ?? 'all';
    const cond = row.condition ?? 'unknown';
    if (!byCategory[cat]) byCategory[cat] = {};
    byCategory[cat][cond] = row;
  });

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>POPE Hallucination Evaluation</h2>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
          Polling-based Object Probing Evaluation â€" binary yes/no answers across three difficulty categories.
          Lower hallucination rate = better. Dataset: MSCOCO val2014 images.
        </p>
      </div>

      {err && <div className="text-xs mb-4 p-2 rounded" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>{err}</div>}

      {/* Run selector */}
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
          <Link href="/visual-perception/run" style={{ color: 'var(--accent)' }} className="text-sm mt-2 block">Launch evaluation â†'</Link>
        </div>
      )}

      {loading && <div className="text-xs mt-4" style={{ color: 'var(--text-muted)' }}>Loading POPE metricsâ€¦</div>}

      {!loading && categoryMetrics.length === 0 && selectedRun && (
        <div className="kpi-card text-center py-6">
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No POPE category metrics in this run yet.</p>
        </div>
      )}

      {/* Per-category tables */}
      {POPE_CATEGORIES.map(cat => {
        const catData = byCategory[cat];
        if (!catData) return null;
        return (
          <div key={cat} className="kpi-card mb-4">
            <h3 className="text-sm font-semibold mb-3 capitalize" style={{ color: 'var(--text-primary)' }}>
              POPE-{cat.charAt(0).toUpperCase() + cat.slice(1)}
              <span className="ml-2 text-xs font-normal" style={{ color: 'var(--text-muted)' }}>
                {cat === 'random' ? 'randomly sampled objects' : cat === 'popular' ? 'frequent co-occurring objects' : 'adversarially chosen objects'}
              </span>
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                    <th className="text-left py-2 pr-4">Condition</th>
                    <th className="text-right py-2 pr-4">Accuracy</th>
                    <th className="text-right py-2 pr-4">F1</th>
                    <th className="text-right py-2 pr-4">Precision</th>
                    <th className="text-right py-2 pr-4">Recall</th>
                    <th className="text-right py-2 pr-4">Hallucination Rate</th>
                    <th className="text-right py-2">Items</th>
                  </tr>
                </thead>
                <tbody>
                  {CONDITIONS.map(c => {
                    const row = catData[c];
                    if (!row) return null;
                    return (
                      <tr key={c} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td className="py-2 pr-4">
                          <span className="inline-block w-2 h-2 rounded-full mr-2" style={{ background: COND_COLORS[c] }}></span>
                          <span style={{ color: COND_COLORS[c] }}>{COND_LABELS[c]}</span>
                        </td>
                        <td className="py-2 pr-4 text-right font-mono" style={{ color: 'var(--text-primary)' }}>{pct(row.accuracy)}</td>
                        <td className="py-2 pr-4 text-right font-mono" style={{ color: 'var(--text-secondary)' }}>{pct(row.f1)}</td>
                        <td className="py-2 pr-4 text-right font-mono" style={{ color: 'var(--text-secondary)' }}>{pct(row.precision)}</td>
                        <td className="py-2 pr-4 text-right font-mono" style={{ color: 'var(--text-secondary)' }}>{pct(row.recall)}</td>
                        <td className="py-2 pr-4 text-right font-mono" style={{ color: '#ef4444' }}>{pct(row.hallucination_rate)}</td>
                        <td className="py-2 text-right" style={{ color: 'var(--text-muted)' }}>{row.item_count ?? 'â€"'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {/* POPE methodology note */}
      <div className="kpi-card mt-2" style={{ borderLeft: '3px solid #8b5cf6' }}>
        <h4 className="text-xs font-semibold mb-2" style={{ color: '#8b5cf6' }}>Methodology Note</h4>
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          POPE asks "Is there a [object] in the image?" â€" a binary yes/no question for each image.
          Hallucination rate = fraction of questions where the model affirms a non-existent object.
          Three difficulty levels: <em>random</em> (easiest), <em>popular</em> (objects often co-occurring),
          <em>adversarial</em> (objects most likely hallucinated). Measured pre- and post-MITCF intervention.
        </p>
      </div>
    </div>
  );
}
