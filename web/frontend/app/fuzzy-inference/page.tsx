'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';

const Plot = dynamic(() => import('react-plotly.js'), { ssr: false });
const API = 'http://localhost:8080';

interface FuzzyResult {
  algorithm: string;
  fuzzy_quality: number; fuzzy_safety: number; fuzzy_risk: number;
  fuzzy_uncertainty: number; fuzzy_efficiency: number;
  accept_membership: number; verify_membership: number; revise_membership: number;
  escalate_membership: number; refuse_membership: number;
  fuzzy_gate_score: number; decision_action: string;
}

interface Distribution {
  decision_action: string; count: number; proportion: number;
}

const ACTION_COLORS: Record<string, string> = {
  accept: '#22c55e', verify: '#3b82f6', revise: '#f59e0b', escalate: '#f97316', refuse: '#ef4444',
};

export default function FuzzyInferencePage() {
  const [results, setResults] = useState<FuzzyResult[]>([]);
  const [distribution, setDistribution] = useState<Distribution[]>([]);
  const [qualityCurves, setQualityCurves] = useState<any>(null);
  const [riskCurves, setRiskCurves] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`${API}/api/fuzzy/gate-results`).then((r) => r.json()),
      fetch(`${API}/api/fuzzy/action-distribution`).then((r) => r.json()),
      fetch(`${API}/api/fuzzy/membership-curves/quality`).then((r) => r.json()),
      fetch(`${API}/api/fuzzy/membership-curves/risk`).then((r) => r.json()),
    ]).then(([res, dist, qc, rc]) => {
      setResults(res); setDistribution(dist); setQualityCurves(qc); setRiskCurves(rc);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const plotLayout = {
    paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
    margin: { t: 10, l: 45, r: 15, b: 40 },
    xaxis: { color: '#94a3b8', range: [0, 1] },
    yaxis: { color: '#94a3b8', range: [-0.05, 1.15] },
    legend: { font: { color: '#94a3b8', size: 10 }, bgcolor: 'transparent' },
    font: { color: '#94a3b8', size: 11 },
    height: 240,
  };

  const makeMFTraces = (curves: any) => {
    if (!curves?.curves) return [];
    return ['low', 'medium', 'high'].map((set) => ({
      type: 'scatter' as const, mode: 'lines' as const,
      name: set,
      x: (curves.curves[set] || []).map((p: any) => p.x),
      y: (curves.curves[set] || []).map((p: any) => p.y),
      line: { width: 2, color: set === 'low' ? '#ef4444' : set === 'medium' ? '#f59e0b' : '#22c55e' },
    }));
  };

  if (loading) return <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading fuzzy inference data...</div>;

  const inputLabels = ['Quality', 'Safety', 'Risk', 'Uncertainty', 'Efficiency'];
  const inputKeys = ['fuzzy_quality', 'fuzzy_safety', 'fuzzy_risk', 'fuzzy_uncertainty', 'fuzzy_efficiency'] as const;

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Fuzzy Inference System</h2>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
          Mamdani-style fuzzy decision gate applied to {results.length} deep learning algorithms
        </p>
      </div>

      {/* Membership Function Plots */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="kpi-card">
          <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
            Quality/Safety/Efficiency Membership Functions
          </h3>
          <Plot data={makeMFTraces(qualityCurves)} layout={{ ...plotLayout, xaxis: { ...plotLayout.xaxis, title: { text: 'Input Value [0,1]', font: { color: '#94a3b8', size: 10 } } } }}
            config={{ displayModeBar: false }} style={{ width: '100%' }} />
          <div className="mt-2 text-xs grid grid-cols-3 gap-2">
            <div className="p-2 rounded" style={{ background: 'rgba(239,68,68,0.1)' }}>
              <p style={{ color: '#ef4444' }} className="font-medium">LOW</p>
              <p style={{ color: 'var(--text-muted)' }}>left-shoulder [0.35, 0.55]</p>
            </div>
            <div className="p-2 rounded" style={{ background: 'rgba(245,158,11,0.1)' }}>
              <p style={{ color: '#f59e0b' }} className="font-medium">MEDIUM</p>
              <p style={{ color: 'var(--text-muted)' }}>triangle [0.35, 0.58, 0.80]</p>
            </div>
            <div className="p-2 rounded" style={{ background: 'rgba(34,197,94,0.1)' }}>
              <p style={{ color: '#22c55e' }} className="font-medium">HIGH</p>
              <p style={{ color: 'var(--text-muted)' }}>right-shoulder [0.65, 0.85]</p>
            </div>
          </div>
        </div>
        <div className="kpi-card">
          <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
            Risk/Uncertainty Membership Functions
          </h3>
          <Plot data={makeMFTraces(riskCurves)} layout={{ ...plotLayout, xaxis: { ...plotLayout.xaxis, title: { text: 'Input Value [0,1]', font: { color: '#94a3b8', size: 10 } } } }}
            config={{ displayModeBar: false }} style={{ width: '100%' }} />
          <div className="mt-2 text-xs grid grid-cols-3 gap-2">
            <div className="p-2 rounded" style={{ background: 'rgba(239,68,68,0.1)' }}>
              <p style={{ color: '#ef4444' }} className="font-medium">LOW</p>
              <p style={{ color: 'var(--text-muted)' }}>left-shoulder [0.15, 0.35]</p>
            </div>
            <div className="p-2 rounded" style={{ background: 'rgba(245,158,11,0.1)' }}>
              <p style={{ color: '#f59e0b' }} className="font-medium">MEDIUM</p>
              <p style={{ color: 'var(--text-muted)' }}>triangle [0.20, 0.45, 0.70]</p>
            </div>
            <div className="p-2 rounded" style={{ background: 'rgba(34,197,94,0.1)' }}>
              <p style={{ color: '#22c55e' }} className="font-medium">HIGH</p>
              <p style={{ color: 'var(--text-muted)' }}>right-shoulder [0.55, 0.80]</p>
            </div>
          </div>
        </div>
      </div>

      {/* Action Distribution + Gate Scores */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="kpi-card">
          <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
            Decision Action Distribution ({results.length} algorithms)
          </h3>
          {typeof window !== 'undefined' && (
            <Plot
              data={[{
                type: 'pie',
                labels: distribution.map((d) => d.decision_action),
                values: distribution.map((d) => d.count),
                marker: { colors: distribution.map((d) => ACTION_COLORS[d.decision_action] ?? '#94a3b8') },
                hole: 0.4,
                textinfo: 'label+value',
              }]}
              layout={{ paper_bgcolor: 'transparent', height: 300, margin: { t: 10, l: 10, r: 10, b: 10 }, legend: { font: { color: '#94a3b8' }, bgcolor: 'transparent' }, font: { color: '#94a3b8' } }}
              config={{ displayModeBar: false }}
              style={{ width: '100%' }}
            />
          )}
        </div>
        <div className="kpi-card">
          <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
            Fuzzy Gate Score by Algorithm
          </h3>
          {typeof window !== 'undefined' && (
            <Plot
              data={[{
                type: 'bar',
                x: results.map((r) => r.algorithm.replace(/^\d+_/, '')),
                y: results.map((r) => r.fuzzy_gate_score),
                marker: { color: results.map((r) => ACTION_COLORS[r.decision_action] ?? '#94a3b8') },
                text: results.map((r) => r.decision_action),
                hovertemplate: '%{x}<br>Score: %{y:.4f}<br>Action: %{text}<extra></extra>',
              }]}
              layout={{ paper_bgcolor: 'transparent', plot_bgcolor: 'transparent', margin: { t: 10, l: 50, r: 10, b: 80 }, xaxis: { color: '#94a3b8', tickangle: -45, tickfont: { size: 9 } }, yaxis: { color: '#94a3b8', range: [0, 1] }, font: { color: '#94a3b8', size: 11 }, height: 300 }}
              config={{ displayModeBar: false }}
              style={{ width: '100%' }}
            />
          )}
        </div>
      </div>

      {/* Results Table */}
      <div className="kpi-card">
        <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
          Fuzzy Gate Results — All 20 Algorithms
        </h3>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Algorithm</th>
                {inputLabels.map((l) => <th key={l}>{l}</th>)}
                <th>Accept</th><th>Verify</th><th>Revise</th><th>Escalate</th><th>Refuse</th>
                <th>Gate Score</th>
                <th>Decision</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.algorithm}>
                  <td><span className="font-mono text-xs">{r.algorithm}</span></td>
                  {inputKeys.map((k) => (
                    <td key={k} className="font-mono text-xs">{r[k].toFixed(3)}</td>
                  ))}
                  <td className="font-mono text-xs">{r.accept_membership.toFixed(3)}</td>
                  <td className="font-mono text-xs">{r.verify_membership.toFixed(3)}</td>
                  <td className="font-mono text-xs">{r.revise_membership.toFixed(3)}</td>
                  <td className="font-mono text-xs">{r.escalate_membership.toFixed(3)}</td>
                  <td className="font-mono text-xs">{r.refuse_membership.toFixed(3)}</td>
                  <td className="font-mono text-xs font-bold" style={{ color: 'var(--accent)' }}>{r.fuzzy_gate_score.toFixed(4)}</td>
                  <td>
                    <span className={`badge badge-${r.decision_action}`}>{r.decision_action}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
