'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import KPICard from '../components/KPICard';
import {
  FlaskConical, Brain, CheckCircle, AlertTriangle, Shield,
  TrendingUp, Activity, Database, BarChart2, Clock
} from 'lucide-react';

const Plot = dynamic(() => import('react-plotly.js'), { ssr: false });

const API = 'http://localhost:8080';

interface DashboardData {
  kpis: {
    completed_experiments: number;
    trained_models: number;
    active_experiments: number;
    latest_run_id: string;
    best_model: string;
    best_model_accuracy: number;
    best_model_f1: number;
    best_model_auc: number;
    dataset: string;
    training_examples: number;
  };
  mitcf_performance: {
    baseline_accuracy: number;
    full_mitcf_accuracy: number;
    baseline_ti: number;
    full_mitcf_ti: number;
    baseline_hallucination_rate: number;
    full_mitcf_hallucination_rate: number;
    full_mitcf_robustness_score: number;
    full_mitcf_bias_rate: number;
    full_mitcf_attack_success_rate: number;
  };
  condition_comparison: Array<Record<string, string>>;
  recent_runs: Array<{ run_id: string; created_at: string; full_mitcf_accuracy: number; full_mitcf_ti: number }>;
}

function pct(v: number) {
  return `${(v * 100).toFixed(1)}%`;
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API}/api/dashboard`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch((e) => { setError(String(e)); setLoading(false); });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading dashboard data...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl p-6 border" style={{ background: 'rgba(239,68,68,0.1)', borderColor: 'var(--danger)' }}>
        <p className="text-sm font-medium" style={{ color: 'var(--danger)' }}>Backend connection error</p>
        <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
          Start the backend: <code className="font-mono bg-black bg-opacity-30 px-1 rounded">.venv\Scripts\python.exe -m uvicorn web.backend.main:app --port 8000</code>
        </p>
        <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{error}</p>
      </div>
    );
  }

  const { kpis, mitcf_performance, condition_comparison, recent_runs } = data;

  // Condition comparison chart data
  const conditions = condition_comparison.map((r) => r.condition?.replace('mitcf_', 'MITCF ').replace('_', ' ') || '');
  const accuracies = condition_comparison.map((r) => parseFloat(r.accuracy || '0'));
  const tis = condition_comparison.map((r) => parseFloat(r.trustworthiness_index || '0'));

  // Accuracy improvement delta
  const accuracyImprovement = ((mitcf_performance.full_mitcf_accuracy - mitcf_performance.baseline_accuracy) * 100).toFixed(1);
  const tiImprovement = ((mitcf_performance.full_mitcf_ti - mitcf_performance.baseline_ti) * 100).toFixed(1);

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
          MITCF Research Dashboard
        </h2>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
          Modular Inference-Time Control Framework Â· Trustworthiness &amp; Adversarial Robustness
        </p>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
        <KPICard
          title="Completed Experiments"
          value={kpis.completed_experiments}
          icon={FlaskConical}
          color="blue"
          subtitle="MITCF pipeline runs"
        />
        <KPICard
          title="Trained Models"
          value={kpis.trained_models}
          icon={Brain}
          color="purple"
          subtitle="Neural network variants"
        />
        <KPICard
          title="Full MITCF Accuracy"
          value={pct(mitcf_performance.full_mitcf_accuracy)}
          icon={CheckCircle}
          color="green"
          trend="up"
          trendValue={`+${accuracyImprovement}pp vs baseline`}
          subtitle={`Baseline: ${pct(mitcf_performance.baseline_accuracy)}`}
        />
        <KPICard
          title="Trustworthiness Index"
          value={mitcf_performance.full_mitcf_ti.toFixed(3)}
          icon={Shield}
          color="green"
          trend="up"
          trendValue={`+${tiImprovement}pp vs baseline`}
          subtitle={`Baseline: ${mitcf_performance.baseline_ti.toFixed(3)}`}
        />
        <KPICard
          title="Robustness Score"
          value={pct(mitcf_performance.full_mitcf_robustness_score)}
          icon={TrendingUp}
          color="green"
          subtitle="Full MITCF (attack success = 0)"
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <KPICard
          title="Hallucination Rate"
          value={pct(mitcf_performance.full_mitcf_hallucination_rate)}
          icon={AlertTriangle}
          color="yellow"
          subtitle={`Baseline: ${pct(mitcf_performance.baseline_hallucination_rate)}`}
        />
        <KPICard
          title="Bias Rate"
          value={pct(mitcf_performance.full_mitcf_bias_rate)}
          icon={CheckCircle}
          color="green"
          subtitle="Full MITCF (0% bias)"
        />
        <KPICard
          title="Best Neural Model"
          value={kpis.best_model.replace(/^\d+_/, '')}
          icon={Brain}
          color="blue"
          subtitle={`Test Acc: ${pct(kpis.best_model_accuracy)}  F1: ${pct(kpis.best_model_f1)}`}
        />
        <KPICard
          title="Training Examples"
          value={kpis.training_examples}
          icon={Database}
          color="purple"
          subtitle="Benchmark items (expanded)"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Condition Accuracy Chart */}
        <div className="kpi-card">
          <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
            Accuracy by MITCF Condition (Ablation Study)
          </h3>
          {typeof window !== 'undefined' && (
            <Plot
              data={[
                {
                  type: 'bar',
                  x: conditions,
                  y: accuracies,
                  marker: {
                    color: accuracies.map((v) =>
                      v > 0.7 ? '#22c55e' : v > 0.4 ? '#f59e0b' : '#ef4444'
                    ),
                  },
                  text: accuracies.map((v) => pct(v)),
                  textposition: 'outside',
                  hovertemplate: '%{x}<br>Accuracy: %{y:.3f}<extra></extra>',
                },
              ]}
              layout={{
                paper_bgcolor: 'transparent',
                plot_bgcolor: 'transparent',
                margin: { t: 10, l: 50, r: 20, b: 100 },
                xaxis: { color: '#94a3b8', tickfont: { size: 10 }, tickangle: -20 },
                yaxis: { color: '#94a3b8', range: [0, 1.1], tickformat: '.0%' },
                font: { color: '#94a3b8', size: 11 },
                height: 280,
              }}
              config={{ displayModeBar: true, modeBarButtonsToRemove: ['lasso2d', 'select2d'], displaylogo: false }}
              style={{ width: '100%' }}
            />
          )}
        </div>

        {/* Trustworthiness Index Chart */}
        <div className="kpi-card">
          <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
            Trustworthiness Index by Condition
          </h3>
          {typeof window !== 'undefined' && (
            <Plot
              data={[
                {
                  type: 'bar',
                  x: conditions,
                  y: tis,
                  marker: {
                    color: tis.map((v) =>
                      v > 0.7 ? '#3b82f6' : v > 0.4 ? '#f59e0b' : '#ef4444'
                    ),
                  },
                  text: tis.map((v) => v.toFixed(3)),
                  textposition: 'outside',
                  hovertemplate: '%{x}<br>TI: %{y:.4f}<extra></extra>',
                },
              ]}
              layout={{
                paper_bgcolor: 'transparent',
                plot_bgcolor: 'transparent',
                margin: { t: 10, l: 50, r: 20, b: 100 },
                xaxis: { color: '#94a3b8', tickfont: { size: 10 }, tickangle: -20 },
                yaxis: { color: '#94a3b8', range: [0, 1.1] },
                font: { color: '#94a3b8', size: 11 },
                height: 280,
              }}
              config={{ displayModeBar: true, modeBarButtonsToRemove: ['lasso2d', 'select2d'], displaylogo: false }}
              style={{ width: '100%' }}
            />
          )}
        </div>
      </div>

      {/* Condition Metrics Table */}
      <div className="kpi-card mb-6">
        <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
          MITCF Condition Metrics â€” {kpis.latest_run_id}
        </h3>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Condition</th>
                <th>Accuracy</th>
                <th>Hallucination</th>
                <th>Bias Rate</th>
                <th>Attack Succ.</th>
                <th>Robustness</th>
                <th>Decision Rel.</th>
                <th>TI</th>
                <th>Avg Calls</th>
                <th>Avg Latency (s)</th>
              </tr>
            </thead>
            <tbody>
              {condition_comparison.map((row) => {
                const isFull = row.condition === 'full_mitcf';
                const ti = parseFloat(row.trustworthiness_index || '0');
                return (
                  <tr key={row.condition} style={isFull ? { background: 'rgba(59,130,246,0.08)' } : {}}>
                    <td>
                      <span className="font-mono text-xs"
                        style={{ color: isFull ? 'var(--accent)' : 'var(--text-secondary)' }}>
                        {row.condition}
                      </span>
                    </td>
                    <td>{pct(parseFloat(row.accuracy || '0'))}</td>
                    <td>{pct(parseFloat(row.hallucination_rate || '0'))}</td>
                    <td>{pct(parseFloat(row.bias_rate || '0'))}</td>
                    <td>{pct(parseFloat(row.attack_success_rate || '0'))}</td>
                    <td>{pct(parseFloat(row.robustness_score || '0'))}</td>
                    <td>{parseFloat(row.decision_reliability || '0').toFixed(3)}</td>
                    <td>
                      <span style={{ color: ti > 0.7 ? 'var(--success)' : ti > 0.4 ? 'var(--warning)' : 'var(--danger)', fontWeight: 600 }}>
                        {ti.toFixed(3)}
                      </span>
                    </td>
                    <td>{parseFloat(row.avg_model_calls || '0').toFixed(2)}</td>
                    <td>{parseFloat(row.avg_latency_s || '0').toExponential(2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent Runs + TI Decomposition */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="kpi-card">
          <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
            Recent Experiment Runs
          </h3>
          {recent_runs.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No experiment data available.</p>
          ) : (
            <div className="space-y-3">
              {recent_runs.map((run) => (
                <div key={run.run_id} className="flex items-center justify-between p-3 rounded-lg"
                  style={{ background: 'var(--bg-hover)' }}>
                  <div>
                    <p className="text-xs font-mono" style={{ color: 'var(--accent)' }}>{run.run_id}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      {run.created_at ? new Date(run.created_at).toLocaleString() : 'Unknown date'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold" style={{ color: 'var(--success)' }}>
                      {pct(run.full_mitcf_accuracy)}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      TI: {run.full_mitcf_ti.toFixed(3)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* TI Components Radar/Bar */}
        <div className="kpi-card">
          <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
            Trustworthiness Dimensions â€” Full MITCF vs Baseline
          </h3>
          {(() => {
            const fullRow = condition_comparison.find((r) => r.condition === 'full_mitcf');
            const baseRow = condition_comparison.find((r) => r.condition === 'baseline');
            if (!fullRow || !baseRow) return <p style={{ color: 'var(--text-muted)' }} className="text-sm">No data available.</p>;
            const dims = ['ti_hallucination', 'ti_bias', 'ti_robustness', 'ti_decision'];
            const labels = ['Hallucination', 'Bias', 'Robustness', 'Decision'];
            const fullVals = dims.map((d) => parseFloat(fullRow[d] || '0'));
            const baseVals = dims.map((d) => parseFloat(baseRow[d] || '0'));
            return typeof window !== 'undefined' ? (
              <Plot
                data={[
                  {
                    type: 'bar',
                    name: 'Full MITCF',
                    x: labels,
                    y: fullVals,
                    marker: { color: '#3b82f6' },
                    text: fullVals.map((v) => v.toFixed(3)),
                    textposition: 'outside',
                  },
                  {
                    type: 'bar',
                    name: 'Baseline',
                    x: labels,
                    y: baseVals,
                    marker: { color: '#ef4444' },
                    text: baseVals.map((v) => v.toFixed(3)),
                    textposition: 'outside',
                  },
                ]}
                layout={{
                  paper_bgcolor: 'transparent',
                  plot_bgcolor: 'transparent',
                  margin: { t: 10, l: 40, r: 20, b: 60 },
                  xaxis: { color: '#94a3b8' },
                  yaxis: { color: '#94a3b8', range: [0, 1.2] },
                  legend: { font: { color: '#94a3b8', size: 11 }, bgcolor: 'transparent' },
                  barmode: 'group',
                  font: { color: '#94a3b8', size: 11 },
                  height: 260,
                }}
                config={{ displayModeBar: false }}
                style={{ width: '100%' }}
              />
            ) : null;
          })()}
        </div>
      </div>
    </div>
  );
}
