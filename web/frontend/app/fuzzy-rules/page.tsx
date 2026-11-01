'use client';
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';

const Plot = dynamic(() => import('react-plotly.js'), { ssr: false });
const API = 'http://localhost:8080';

interface GateRow {
  algorithm: string; fuzzy_quality: number; fuzzy_safety: number; fuzzy_risk: number;
  fuzzy_uncertainty: number; fuzzy_efficiency: number;
  accept_membership: number; verify_membership: number; revise_membership: number;
  escalate_membership: number; refuse_membership: number;
  fuzzy_gate_score: number; decision_action: string;
}

const RULES = [
  { id:1, if_part:'quality=HIGH AND risk=LOW AND uncertainty=LOW', action:'accept', confidence:'Very High' },
  { id:2, if_part:'quality=HIGH AND safety=HIGH AND efficiency=HIGH', action:'accept', confidence:'High' },
  { id:3, if_part:'quality=HIGH AND risk=LOW', action:'verify', confidence:'Medium' },
  { id:4, if_part:'quality=MEDIUM AND risk=MEDIUM', action:'verify', confidence:'Medium' },
  { id:5, if_part:'quality=LOW AND risk=LOW', action:'verify', confidence:'Low-Medium' },
  { id:6, if_part:'quality=HIGH AND uncertainty=MEDIUM', action:'verify', confidence:'Medium' },
  { id:7, if_part:'quality=MEDIUM AND safety=LOW', action:'revise', confidence:'Medium' },
  { id:8, if_part:'quality=LOW AND uncertainty=MEDIUM', action:'revise', confidence:'Medium' },
  { id:9, if_part:'risk=MEDIUM AND uncertainty=MEDIUM', action:'revise', confidence:'Medium' },
  { id:10, if_part:'quality=MEDIUM AND risk=HIGH', action:'escalate', confidence:'High' },
  { id:11, if_part:'quality=LOW AND risk=HIGH', action:'refuse', confidence:'High' },
  { id:12, if_part:'safety=LOW AND risk=HIGH', action:'refuse', confidence:'Very High' },
  { id:13, if_part:'uncertainty=HIGH AND quality=LOW', action:'refuse', confidence:'High' },
  { id:14, if_part:'safety=LOW AND uncertainty=HIGH', action:'escalate', confidence:'High' },
  { id:15, if_part:'quality=LOW AND safety=LOW AND risk=HIGH', action:'refuse', confidence:'Very High' },
];

const ACTION_COLORS: Record<string, string> = {
  accept:'#22c55e', verify:'#3b82f6', revise:'#f59e0b', escalate:'#f97316', refuse:'#ef4444',
};
const ACTION_CENTROIDS: Record<string, number> = { refuse:0.05, escalate:0.25, revise:0.45, verify:0.65, accept:0.90 };

export default function FuzzyRulesPage() {
  const [gateRows, setGateRows] = useState<GateRow[]>([]);
  const [selectedAlgo, setSelectedAlgo] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/api/fuzzy/gate-results`).then(r => r.json()).then((rows: GateRow[]) => {
      setGateRows(rows);
      if (rows.length) setSelectedAlgo(rows[0].algorithm);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const selRow = gateRows.find(r => r.algorithm === selectedAlgo);

  function estimateRuleActivation(row: GateRow, rule: typeof RULES[0]): number {
    const mQ = row.fuzzy_quality; const mS = row.fuzzy_safety; const mR = 1 - row.fuzzy_risk;
    const mU = 1 - row.fuzzy_uncertainty; const mE = row.fuzzy_efficiency;
    const avg = (mQ + mS + mR + mU + mE) / 5;
    const actionMap: Record<string, number> = {
      accept: Math.max(row.accept_membership, 0),
      verify: Math.max(row.verify_membership, 0),
      revise: Math.max(row.revise_membership, 0),
      escalate: Math.max(row.escalate_membership, 0),
      refuse: Math.max(row.refuse_membership, 0),
    };
    return actionMap[rule.action] * 0.4 + avg * 0.6;
  }

  if (loading) return <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading fuzzy rules...</div>;

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Fuzzy Rules</h2>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
          15 Mamdani-style IF-THEN rules in the FuzzyDecisionGate. Centroid defuzzification with 5 action singletons.
        </p>
      </div>

      {/* Action centroids */}
      <div className="kpi-card mb-6">
        <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Action Centroids (Defuzzification Points)</h3>
        <div className="flex flex-wrap gap-3 mb-3">
          {Object.entries(ACTION_CENTROIDS).map(([action, centroid]) => (
            <div key={action} className="px-4 py-2 rounded text-center" style={{ background: `${ACTION_COLORS[action]}15`, border: `1px solid ${ACTION_COLORS[action]}40` }}>
              <div className="text-xs font-bold" style={{ color: ACTION_COLORS[action] }}>{action.toUpperCase()}</div>
              <div className="text-lg font-mono font-bold" style={{ color: ACTION_COLORS[action] }}>{centroid}</div>
              <div className="text-xs" style={{ color: 'var(--text-muted)' }}>gate score</div>
            </div>
          ))}
        </div>
        <Plot
          data={[{
            type: 'scatter', mode: 'markers+text',
            x: Object.values(ACTION_CENTROIDS),
            y: Object.keys(ACTION_CENTROIDS).map(() => 0.5),
            text: Object.keys(ACTION_CENTROIDS),
            textposition: 'top center' as const,
            marker: { color: Object.keys(ACTION_CENTROIDS).map(a => ACTION_COLORS[a]), size: 16 },
            textfont: { color: Object.keys(ACTION_CENTROIDS).map(a => ACTION_COLORS[a]), size: 12 },
          }]}
          layout={{
            paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
            margin: { t: 30, l: 10, r: 10, b: 30 }, height: 120,
            xaxis: { color: '#94a3b8', range: [-0.05, 1.05], showgrid: false },
            yaxis: { color: '#94a3b8', visible: false, range: [0, 1] },
            showlegend: false,
          }}
          config={{ displayModeBar: false }} style={{ width: '100%' }} />
      </div>

      {/* Rule table with optional activation */}
      <div className="kpi-card mb-6">
        <div className="flex items-center gap-3 mb-3">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Rule Activation</h3>
          <label className="text-xs" style={{ color: 'var(--text-muted)' }}>for algorithm:</label>
          <select value={selectedAlgo} onChange={e => setSelectedAlgo(e.target.value)}
            className="text-xs px-2 py-1 rounded" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
            {gateRows.map(r => <option key={r.algorithm} value={r.algorithm}>{r.algorithm}</option>)}
          </select>
        </div>
        <table className="data-table">
          <thead>
            <tr><th>#</th><th>IF Condition</th><th>THEN Action</th><th>Confidence</th>{selRow && <th>Activation</th>}</tr>
          </thead>
          <tbody>
            {RULES.map(rule => {
              const activation = selRow ? estimateRuleActivation(selRow, rule) : 0;
              const isActive = selRow && selRow.decision_action === rule.action;
              return (
                <tr key={rule.id} style={{ background: isActive ? `${ACTION_COLORS[rule.action]}0a` : undefined }}>
                  <td><span className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>R{rule.id}</span></td>
                  <td><span className="font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>{rule.if_part}</span></td>
                  <td>
                    <span className="badge font-semibold" style={{ background: `${ACTION_COLORS[rule.action]}20`, color: ACTION_COLORS[rule.action] }}>
                      {rule.action.toUpperCase()}
                    </span>
                  </td>
                  <td><span className="text-xs" style={{ color: 'var(--text-muted)' }}>{rule.confidence}</span></td>
                  {selRow && (
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="h-2 rounded flex-1 overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)', maxWidth: '80px' }}>
                          <div className="h-full rounded" style={{ width: `${activation * 100}%`, background: ACTION_COLORS[rule.action] }} />
                        </div>
                        <span className="text-xs font-mono" style={{ color: ACTION_COLORS[rule.action] }}>{activation.toFixed(2)}</span>
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
          Source: <code>mitcf_pipeline/fuzzy_gate.py</code> — 15 Mamdani rules, centroid defuzzification.
          Activation estimates derived from action memberships and fuzzy input values.
        </p>
      </div>
    </div>
  );
}
