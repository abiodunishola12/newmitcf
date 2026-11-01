'use client';

export default function ResearchOverview() {
  const conditions = [
    { name: 'baseline', verification: false, critique: false, revision: false, gate: false },
    { name: 'mitcf_1_verification', verification: true, critique: false, revision: false, gate: false },
    { name: 'mitcf_2_verification_critique', verification: true, critique: true, revision: false, gate: false },
    { name: 'mitcf_3_verification_critique_revision', verification: true, critique: true, revision: true, gate: false },
    { name: 'full_mitcf', verification: true, critique: true, revision: true, gate: true },
  ];

  const Cell = ({ active }: { active: boolean }) => (
    <td className="px-4 py-2 text-center">
      <span className={active ? 'text-green-400 font-bold' : 'text-gray-600'}>
        {active ? '✓' : '✗'}
      </span>
    </td>
  );

  const results = [
    { condition: 'baseline', accuracy: '18.2%', ti: '0.161', color: '#ef4444' },
    { condition: 'mitcf_1_verification', accuracy: '18.2%', ti: '0.161', color: '#f97316' },
    { condition: 'mitcf_2_verification_critique', accuracy: '18.2%', ti: '0.161', color: '#f59e0b' },
    { condition: 'mitcf_3_verification_critique_revision', accuracy: '72.7%', ti: '0.748', color: '#3b82f6' },
    { condition: 'full_mitcf', accuracy: '81.8%', ti: '0.922', color: '#22c55e' },
  ];

  return (
    <div className="max-w-5xl">
      <div className="mb-8">
        <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Research Overview</h2>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Modular Inference-Time Control Framework (MITCF) for Trustworthiness and Adversarial Robustness in Agentic Autonomous Models
        </p>
      </div>

      {/* Research Problem */}
      <div className="kpi-card mb-6">
        <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--accent)' }}>Research Problem</h3>
        <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          Agentic autonomous AI models face four key trustworthiness threats: hallucination (generating
          unsupported claims), bias (producing stereotyped outputs), adversarial vulnerability (complying
          with unsafe prompts), and decision unreliability (refusing benign requests). This research
          implements and evaluates a modular inference-time control framework that intercepts model outputs
          and applies structured correction mechanisms.
        </p>
      </div>

      {/* MITCF Pipeline Flow */}
      <div className="kpi-card mb-6">
        <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--accent)' }}>MITCF Pipeline Architecture</h3>
        <div className="flex items-center gap-2 flex-wrap">
          {[
            { label: 'Benchmark Item', color: '#1e293b', border: '#334155' },
            { label: '→', color: 'transparent', border: 'transparent' },
            { label: 'Model Output\n(Candidate)', color: '#1e3a5f', border: '#3b82f6' },
            { label: '→', color: 'transparent', border: 'transparent' },
            { label: 'Verification\nModule', color: '#1a3a2f', border: '#22c55e' },
            { label: '→', color: 'transparent', border: 'transparent' },
            { label: 'Critique\nModule', color: '#3a2a10', border: '#f59e0b' },
            { label: '→', color: 'transparent', border: 'transparent' },
            { label: 'Revision\nModule', color: '#2d1a3a', border: '#a855f7' },
            { label: '→', color: 'transparent', border: 'transparent' },
            { label: 'Decision\nGate', color: '#1e1a3a', border: '#6366f1' },
            { label: '→', color: 'transparent', border: 'transparent' },
            { label: 'Final\nOutput', color: '#0f2a1a', border: '#22c55e' },
          ].map((box, i) => (
            <div key={i} className={box.color === 'transparent' ? 'text-lg font-bold' : 'px-3 py-2 rounded-lg text-center text-xs font-medium'}
              style={box.color !== 'transparent' ? {
                background: box.color,
                border: `1px solid ${box.border}`,
                color: box.border,
                whiteSpace: 'pre-line',
                minWidth: 80,
              } : { color: 'var(--text-muted)' }}>
              {box.label}
            </div>
          ))}
        </div>
      </div>

      {/* Condition Table */}
      <div className="kpi-card mb-6">
        <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--accent)' }}>Ablation Study — 5 Experimental Conditions</h3>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Condition</th>
                <th className="text-center">Verification</th>
                <th className="text-center">Critique</th>
                <th className="text-center">Revision</th>
                <th className="text-center">Decision Gate</th>
              </tr>
            </thead>
            <tbody>
              {conditions.map((c) => (
                <tr key={c.name} style={c.name === 'full_mitcf' ? { background: 'rgba(59,130,246,0.08)' } : {}}>
                  <td><span className="font-mono text-xs" style={{ color: c.name === 'full_mitcf' ? 'var(--accent)' : 'var(--text-secondary)' }}>{c.name}</span></td>
                  <Cell active={c.verification} />
                  <Cell active={c.critique} />
                  <Cell active={c.revision} />
                  <Cell active={c.gate} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Results */}
      <div className="kpi-card mb-6">
        <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--accent)' }}>Experimental Results Summary</h3>
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
          {results.map((r) => (
            <div key={r.condition} className="p-3 rounded-lg text-center"
              style={{ background: 'var(--bg-hover)', border: `1px solid ${r.color}44` }}>
              <p className="text-xs font-mono mb-2" style={{ color: 'var(--text-muted)' }}>{r.condition.replace('mitcf_', '')}</p>
              <p className="text-xl font-bold" style={{ color: r.color }}>{r.accuracy}</p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>TI: {r.ti}</p>
            </div>
          ))}
        </div>
        <p className="text-xs mt-4" style={{ color: 'var(--text-muted)' }}>
          * Full MITCF achieves 81.8% accuracy and a Trustworthiness Index of 0.922, compared to 18.2% and 0.161 for the baseline (no controls).
          The revision module (introduced in condition 3) provides the largest single improvement.
        </p>
      </div>

      {/* Key Metrics */}
      <div className="kpi-card">
        <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--accent)' }}>Key Research Contributions</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            { title: 'Modular Architecture', desc: 'Four independently configurable control modules: Verification, Critique, Revision, Decision Gate' },
            { title: 'Fuzzy Decision Gate', desc: 'Mamdani fuzzy inference system with 5 input variables, 15 rules, and centroid defuzzification' },
            { title: 'TI Metric', desc: 'Composite Trustworthiness Index across 4 dimensions: hallucination, bias, robustness, decision reliability' },
            { title: 'Neural Classifier', desc: 'Pure-Python implementation of 20 MLP variants as trustworthiness classifiers, selected via fuzzy gating' },
          ].map((item) => (
            <div key={item.title} className="p-3 rounded-lg" style={{ background: 'var(--bg-hover)' }}>
              <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>{item.title}</p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
