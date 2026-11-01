'use client';
import { useEffect, useState } from 'react';
const API = 'http://localhost:8080';

interface CondRow {
  condition: string; accuracy: string; trustworthiness_index: string;
  hallucination_rate: string; bias_rate: string; robustness_score: string;
}

const CONDITIONS = [
  { id:'baseline', label:'Baseline', color:'#ef4444', modules:['LLM Call'] },
  { id:'mitcf_1_verification', label:'MITCF-1', color:'#f59e0b', modules:['LLM Call','Verification'] },
  { id:'mitcf_2_verification_critique', label:'MITCF-2', color:'#3b82f6', modules:['LLM Call','Verification','Critique'] },
  { id:'mitcf_3_verification_critique_revision', label:'MITCF-3', color:'#6366f1', modules:['LLM Call','Verification','Critique','Revision'] },
  { id:'full_mitcf', label:'Full MITCF', color:'#22c55e', modules:['LLM Call','Verification','Critique','Revision','DecisionGate'] },
];

const PIPELINE_STEPS = [
  { id:'input', label:'Input', desc:'Task + BenchmarkItem', color:'#64748b', icon:'📥' },
  { id:'verify', label:'VerificationModule', desc:'Fact check, hallucination detection via LexicalHallucinationDetector', color:'#3b82f6', icon:'🔍' },
  { id:'critique', label:'CritiqueModule', desc:'Bias detection, quality assessment, safety scoring', color:'#f59e0b', icon:'🧐' },
  { id:'revise', label:'RevisionModule', desc:'Corrects errors from Verification + Critique feedback', color:'#a855f7', icon:'✏️' },
  { id:'gate', label:'DecisionGate', desc:'FuzzyDecisionGate: 5 inputs → 15 rules → centroid defuzz → action', color:'#22c55e', icon:'🚪' },
  { id:'output', label:'Output', desc:'Final response + GateResult + RunRecord', color:'#06b6d4', icon:'📤' },
];

export default function MITCFFrameworkPage() {
  const [condRows, setCondRows] = useState<CondRow[]>([]);

  useEffect(() => {
    fetch(`${API}/api/experiments`).then(r=>r.json()).then((runs:{run_id:string}[]) => {
      if (!runs.length) return;
      fetch(`${API}/api/experiments/${runs[runs.length-1].run_id}/condition-metrics`).then(r=>r.json()).then(setCondRows);
    }).catch(()=>{});
  }, []);

  function getRow(cond: string) {
    return condRows.find(r => r.condition === cond);
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold" style={{ color:'var(--text-primary)' }}>MITCF Framework</h2>
        <p className="text-sm mt-1" style={{ color:'var(--text-muted)' }}>
          Modular Inference-Time Control Framework — trustworthiness and adversarial robustness in agentic AI systems.
        </p>
      </div>

      {/* Pipeline diagram */}
      <div className="kpi-card mb-6">
        <h3 className="text-sm font-semibold mb-4" style={{ color:'var(--text-primary)' }}>MITCF Pipeline</h3>
        <div className="flex flex-wrap items-start gap-1 overflow-x-auto pb-2">
          {PIPELINE_STEPS.map((step, i) => (
            <div key={step.id} className="flex items-center gap-1">
              <div className="rounded-xl p-3 text-center" style={{ background:`${step.color}15`, border:`1.5px solid ${step.color}50`, minWidth:'110px', maxWidth:'130px' }}>
                <div className="text-lg mb-1">{step.icon}</div>
                <div className="text-xs font-bold" style={{ color:step.color }}>{step.label}</div>
                <div className="text-xs mt-1" style={{ color:'var(--text-muted)', fontSize:'10px', lineHeight:'1.3' }}>{step.desc}</div>
              </div>
              {i < PIPELINE_STEPS.length - 1 && (
                <div style={{ color:'#475569', fontSize:'20px', padding:'0 2px', marginTop:'-20px' }}>→</div>
              )}
            </div>
          ))}
        </div>
        <p className="text-xs mt-3" style={{ color:'var(--text-muted)' }}>
          Source: <code>mitcf_pipeline/controller.py</code> — <code>MITCFController.run_condition()</code>
        </p>
      </div>

      {/* Condition table with real results */}
      <div className="kpi-card mb-6">
        <h3 className="text-sm font-semibold mb-4" style={{ color:'var(--text-primary)' }}>Ablation Conditions — Module Activation & Results</h3>
        <div className="space-y-3">
          {CONDITIONS.map(c => {
            const row = getRow(c.id);
            return (
              <div key={c.id} className="p-3 rounded-lg" style={{ background:`${c.color}08`, border:`1px solid ${c.color}30` }}>
                <div className="flex flex-wrap items-center gap-3 mb-2">
                  <span className="font-bold text-xs" style={{ color:c.color }}>{c.label}</span>
                  <span className="font-mono text-xs" style={{ color:'var(--text-muted)' }}>{c.id}</span>
                  <div className="flex flex-wrap gap-1">
                    {c.modules.map(m => (
                      <span key={m} className="badge text-xs" style={{ background:`${c.color}20`, color:c.color }}>{m}</span>
                    ))}
                  </div>
                  {row && (
                    <div className="ml-auto flex gap-3 text-xs">
                      <span style={{ color:'var(--text-muted)' }}>TI: <span className="font-bold" style={{ color:c.color }}>{parseFloat(row.trustworthiness_index).toFixed(3)}</span></span>
                      <span style={{ color:'var(--text-muted)' }}>Acc: <span className="font-bold" style={{ color:c.color }}>{(parseFloat(row.accuracy)*100).toFixed(0)}%</span></span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Module descriptions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {[
          { name:'VerificationModule', color:'#3b82f6', source:'controls.py', desc:'Runs LexicalHallucinationDetector on model output. Flags hallucinated tokens by comparing against benchmark reference. Sets hallucination_detected flag on the model output.' },
          { name:'CritiqueModule', color:'#f59e0b', source:'controls.py', desc:'Evaluates output for bias, quality, and safety. Uses task type (FACT_CHECK, MATH, CODE) to determine appropriate critique strategy. Produces quality_score and safety_score.' },
          { name:'RevisionModule', color:'#a855f7', source:'controls.py', desc:'If verification or critique found issues, requests a revised response up to max_revision_attempts times. Tracks avg_revisions per run.' },
          { name:'DecisionGate', color:'#22c55e', source:'controls.py + fuzzy_gate.py', desc:'FuzzyDecisionGate with 5 fuzzy inputs → 15 Mamdani rules → centroid defuzzification → GateAction (ACCEPT/VERIFY/REVISE/ESCALATE/REFUSE).' },
          { name:'LexicalHallucinationDetector', color:'#ef4444', source:'detectors.py', desc:'Calibrates a word-overlap threshold against a reference corpus. Detects hallucinations by checking if the output tokens overlap less than the calibrated threshold with the expected answer.' },
          { name:'MITCFController', color:'#06b6d4', source:'controller.py', desc:'Orchestrates all modules. Runs run_condition() for each of 5 ablation conditions. Stores per-item RunRecord to JSONL output.' },
        ].map(m => (
          <div key={m.name} className="kpi-card" style={{ borderTop:`2px solid ${m.color}` }}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-bold" style={{ color:m.color }}>{m.name}</span>
              <span className="badge" style={{ background:'rgba(255,255,255,0.05)', color:'var(--text-muted)', fontSize:'10px' }}>{m.source}</span>
            </div>
            <p className="text-xs" style={{ color:'var(--text-secondary)' }}>{m.desc}</p>
          </div>
        ))}
      </div>

      {/* Key contributions */}
      <div className="kpi-card" style={{ borderLeft:'3px solid #22c55e' }}>
        <h3 className="text-sm font-semibold mb-3" style={{ color:'var(--text-primary)' }}>Key Research Contributions</h3>
        <div className="space-y-2">
          {[
            'Pure-Python Mamdani fuzzy inference system — no external ML dependencies',
            'Trustworthiness Index (TI) composite metric combining hallucination, bias, robustness, and decision reliability',
            '20-variant neural network sweep using SHA-1 hash feature encoding',
            '5-condition ablation study quantifying each module\'s contribution to TI',
            'Bootstrap confidence intervals + McNemar test + Holm–Bonferroni correction for statistical validation',
          ].map((c, i) => (
            <div key={i} className="flex gap-2 text-xs">
              <span style={{ color:'#22c55e' }}>✓</span>
              <span style={{ color:'var(--text-secondary)' }}>{c}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
