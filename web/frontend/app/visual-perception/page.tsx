'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';

const API = 'http://localhost:8080';

interface Run {
  run_id: string; created_at: string; status: string; item_count: number;
  baseline_accuracy: number | null; full_mitcf_accuracy: number | null;
  has_robustness: boolean; has_ablation: boolean;
}

interface DatasetStatus {
  pope: { ready: boolean; annotations_found: boolean; image_count: number };
  mme: { ready: boolean; categories_found: number; categories_total: number };
}

const CONDITION_INFO = [
  { id: 'baseline', label: 'Baseline', color: '#64748b', desc: 'Unmodified Qwen2.5-VL-3B, no intervention' },
  { id: 'revision_only', label: 'Revision Only', color: '#f59e0b', desc: 'MITCF verification + critique + revision, no fuzzy gate' },
  { id: 'fixed_gate', label: 'Fixed Gate', color: '#3b82f6', desc: 'Fixed-threshold confidence gate comparator' },
  { id: 'full_mitcf', label: 'Full MITCF', color: '#22c55e', desc: 'Complete Mamdani fuzzy-gated MITCF pipeline' },
];

const VP_LINKS = [
  { href: '/visual-perception/pope', label: 'POPE Evaluation', desc: 'Object hallucination â€” random, popular, adversarial', color: '#8b5cf6' },
  { href: '/visual-perception/mme', label: 'MME Evaluation', desc: '14-category visual perception with official scoring', color: '#06b6d4' },
  { href: '/visual-perception/conditions', label: 'Condition Comparison', desc: 'Side-by-side metrics for all four conditions', color: '#f59e0b' },
  { href: '/visual-perception/trustworthiness', label: 'Trustworthiness Index', desc: 'TI: hallucination + bias + robustness + decision', color: '#22c55e' },
  { href: '/visual-perception/robustness', label: 'Adversarial Robustness', desc: 'Perturbation degradation curves', color: '#ef4444' },
  { href: '/visual-perception/run', label: 'Run VP Evaluation', desc: 'Launch evaluate / robustness / ablation jobs', color: '#3b82f6' },
  { href: '/visual-perception/datasets', label: 'Dataset Setup', desc: 'POPE + MME download status and instructions', color: '#64748b' },
];

export default function VPOverviewPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [datasetStatus, setDatasetStatus] = useState<DatasetStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    Promise.all([
      fetch(`${API}/api/visual-perception/runs`).then(r => r.json()),
      fetch(`${API}/api/visual-perception/dataset-status`).then(r => r.json()),
    ]).then(([runsData, dsData]) => {
      setRuns(Array.isArray(runsData) ? runsData : []);
      setDatasetStatus(dsData);
    }).catch(e => setErr(String(e)))
      .finally(() => setLoading(false));
  }, []);

  const pctChange = (base: number | null, full: number | null) => {
    if (base == null || full == null) return null;
    return ((full - base) / (base || 1) * 100).toFixed(1);
  };

  const pctColor = (v: string | null) => {
    if (!v) return 'var(--text-muted)';
    const n = parseFloat(v);
    return n > 0 ? '#22c55e' : n < 0 ? '#ef4444' : 'var(--text-muted)';
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Visual Perception â€” MITCF Evaluation</h2>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
          Qwen2.5-VL-3B-Instruct evaluated on POPE + MME benchmarks under four paired conditions.
          Targeting Elsevier <em>Displays</em> Special Issue: "Perceptual AI Systems in the Era of Large Models."
        </p>
      </div>

      {/* Dataset readiness */}
      {datasetStatus && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          <DatasetCard
            title="POPE Dataset"
            ready={datasetStatus.pope.ready}
            detail={datasetStatus.pope.ready
              ? `${datasetStatus.pope.image_count.toLocaleString()} images Â· 3 annotation files`
              : 'Annotations or images missing â€” see Dataset Setup'}
            href="/visual-perception/datasets"
          />
          <DatasetCard
            title="MME Dataset"
            ready={datasetStatus.mme.ready}
            detail={datasetStatus.mme.ready
              ? `${datasetStatus.mme.categories_found} / ${datasetStatus.mme.categories_total} categories found`
              : `${datasetStatus.mme.categories_found} / ${datasetStatus.mme.categories_total} categories found â€” incomplete`}
            href="/visual-perception/datasets"
          />
        </div>
      )}

      {/* Experimental conditions */}
      <div className="kpi-card mb-6">
        <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Experimental Conditions</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {CONDITION_INFO.map(c => (
            <div key={c.id} className="p-3 rounded" style={{ background: 'rgba(0,0,0,0.2)', borderLeft: `3px solid ${c.color}` }}>
              <div className="text-xs font-semibold mb-1" style={{ color: c.color }}>{c.label}</div>
              <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>{c.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Nav links */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {VP_LINKS.map(l => (
          <Link key={l.href} href={l.href} className="kpi-card block hover:scale-[1.01] transition-transform"
            style={{ borderTop: `2px solid ${l.color}`, textDecoration: 'none' }}>
            <div className="text-sm font-semibold mb-1" style={{ color: l.color }}>{l.label}</div>
            <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>{l.desc}</div>
          </Link>
        ))}
      </div>

      {/* Recent runs */}
      <div className="kpi-card">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Recent VP Runs</h3>
          <Link href="/visual-perception/run" className="text-xs" style={{ color: 'var(--accent)' }}>
            + Launch new run
          </Link>
        </div>
        {loading && <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Loadingâ€¦</div>}
        {err && <div className="text-xs" style={{ color: '#ef4444' }}>{err}</div>}
        {!loading && runs.length === 0 && (
          <div className="text-xs py-6 text-center" style={{ color: 'var(--text-muted)' }}>
            No VP runs yet.{' '}
            <Link href="/visual-perception/run" style={{ color: 'var(--accent)' }}>Launch the first evaluation.</Link>
          </div>
        )}
        {runs.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                  <th className="text-left py-2 pr-4">Run ID</th>
                  <th className="text-left py-2 pr-4">Created</th>
                  <th className="text-right py-2 pr-4">Items</th>
                  <th className="text-right py-2 pr-4">Baseline Acc</th>
                  <th className="text-right py-2 pr-4">Full MITCF Acc</th>
                  <th className="text-right py-2 pr-4">Î”</th>
                  <th className="text-left py-2">Extras</th>
                </tr>
              </thead>
              <tbody>
                {runs.map(r => {
                  const delta = pctChange(r.baseline_accuracy, r.full_mitcf_accuracy);
                  return (
                    <tr key={r.run_id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td className="py-2 pr-4 font-mono" style={{ color: 'var(--accent)' }}>{r.run_id}</td>
                      <td className="py-2 pr-4" style={{ color: 'var(--text-secondary)' }}>
                        {r.created_at ? new Date(r.created_at).toLocaleString() : 'â€”'}
                      </td>
                      <td className="py-2 pr-4 text-right" style={{ color: 'var(--text-primary)' }}>{r.item_count}</td>
                      <td className="py-2 pr-4 text-right font-mono" style={{ color: 'var(--text-secondary)' }}>
                        {r.baseline_accuracy != null ? (r.baseline_accuracy * 100).toFixed(1) + '%' : 'â€”'}
                      </td>
                      <td className="py-2 pr-4 text-right font-mono" style={{ color: '#22c55e' }}>
                        {r.full_mitcf_accuracy != null ? (r.full_mitcf_accuracy * 100).toFixed(1) + '%' : 'â€”'}
                      </td>
                      <td className="py-2 pr-4 text-right font-mono" style={{ color: pctColor(delta) }}>
                        {delta != null ? (parseFloat(delta) > 0 ? '+' : '') + delta + '%' : 'â€”'}
                      </td>
                      <td className="py-2 flex gap-2">
                        {r.has_robustness && <span className="badge" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>robustness</span>}
                        {r.has_ablation && <span className="badge" style={{ background: 'rgba(59,130,246,0.1)', color: '#3b82f6' }}>ablation</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function DatasetCard({ title, ready, detail, href }: { title: string; ready: boolean; detail: string; href: string }) {
  return (
    <div className="kpi-card" style={{ borderLeft: `3px solid ${ready ? '#22c55e' : '#ef4444'}` }}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</span>
        <span className="badge text-xs font-semibold" style={{
          background: ready ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
          color: ready ? '#22c55e' : '#ef4444',
        }}>
          {ready ? 'âœ“ Ready' : 'âœ— Missing'}
        </span>
      </div>
      <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>{detail}</div>
      {!ready && (
        <Link href={href} className="text-xs mt-2 block" style={{ color: 'var(--accent)' }}>
          View download instructions â†’
        </Link>
      )}
    </div>
  );
}
