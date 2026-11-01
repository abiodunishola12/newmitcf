'use client';
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';

const Plot = dynamic(() => import('react-plotly.js'), { ssr: false });
const API = 'http://localhost:8080';

interface ModelRow { rank: number; algorithm: string; activation: string; hidden_layers: string; parameters: number; test_accuracy: number; test_f1: number; test_auc: number; }

export default function ExplainabilityPage() {
  const [models, setModels] = useState<ModelRow[]>([]);

  useEffect(() => {
    fetch(`${API}/api/deep-learning/models`).then(r=>r.json()).then((m:ModelRow[])=>setModels(m.sort((a,b)=>a.rank-b.rank))).catch(()=>{});
  }, []);

  const hashFeatureGroups = [
    { name:'Token Presence', desc:'SHA-1 hash of individual tokens mapped to feature bins. Most informative features are high-frequency terms in the benchmark corpus.', color:'#3b82f6' },
    { name:'Token Frequency', desc:'Counts of hashed token occurrences. Captures repetition patterns correlated with hallucination risk.', color:'#22c55e' },
    { name:'Bigram Hashes', desc:'Consecutive word pairs. Captures phrasing patterns associated with trustworthy vs untrustworthy outputs.', color:'#a855f7' },
  ];

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold" style={{ color:'var(--text-primary)' }}>Explainability</h2>
        <p className="text-sm mt-1" style={{ color:'var(--text-muted)' }}>
          What the MITCF models can and cannot explain about their predictions.
        </p>
      </div>

      {/* Not applicable panel */}
      <div className="kpi-card mb-6" style={{ borderLeft:'3px solid #f59e0b' }}>
        <h3 className="text-sm font-semibold mb-3" style={{ color:'#f59e0b' }}>Techniques Not Applicable to This Implementation</h3>
        <div className="space-y-2">
          {[
            ['SHAP / LIME', 'Requires NumPy/scikit-learn compatibility — not available in the pure-Python implementation'],
            ['Grad-CAM / Attention Maps', 'No deep learning framework — forward pass is manual Python loops with no autograd'],
            ['Saliency Maps', 'Requires differentiable computation graph — not present in pure-Python MLP'],
            ['Feature Importance (permutation)', 'Possible in principle but computationally expensive with 64 hashed features and no framework'],
            ['Layer Activation Analysis', 'Manual forward pass does not store intermediate activations in an accessible form'],
          ].map(([tech, reason])=>(
            <div key={tech as string} className="flex gap-3 text-xs p-2 rounded" style={{ background:'rgba(245,158,11,0.05)' }}>
              <span style={{ color:'#f59e0b', fontWeight:700 }}>✗</span>
              <div>
                <span className="font-semibold" style={{ color:'var(--text-primary)' }}>{tech}:</span>
                <span style={{ color:'var(--text-muted)' }}> {reason}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* What IS available */}
      <div className="kpi-card mb-6" style={{ borderLeft:'3px solid #22c55e' }}>
        <h3 className="text-sm font-semibold mb-3" style={{ color:'#22c55e' }}>Available Explanations</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {hashFeatureGroups.map(g=>(
            <div key={g.name} className="p-3 rounded" style={{ background:`${g.color}10`, border:`1px solid ${g.color}30` }}>
              <div className="text-xs font-semibold mb-1" style={{ color:g.color }}>{g.name}</div>
              <p className="text-xs" style={{ color:'var(--text-secondary)' }}>{g.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Fuzzy input interpretability */}
      <div className="kpi-card mb-6">
        <h3 className="text-sm font-semibold mb-3" style={{ color:'var(--text-primary)' }}>Fuzzy Gate Interpretability</h3>
        <p className="text-sm mb-4" style={{ color:'var(--text-secondary)' }}>
          The FuzzyDecisionGate is fully interpretable by design. Each decision is explained by:
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            { title:'5 Crisp Input Values', desc:'quality, safety, risk, uncertainty, efficiency — each computed from model metrics and mapped to [0,1]' },
            { title:'Membership Degrees', desc:'Each input&apos;s degree of membership in LOW/MEDIUM/HIGH fuzzy sets, visible per algorithm' },
            { title:'15 Rule Activations', desc:'Each Mamdani IF-THEN rule contributes a weighted vote for its output action (see Fuzzy Rules page)' },
            { title:'Centroid Gate Score', desc:'Final crisp score via centroid defuzzification; decision = nearest action centroid' },
          ].map(item=>(
            <div key={item.title} className="flex gap-2 p-2 rounded" style={{ background:'rgba(255,255,255,0.03)' }}>
              <span className="text-green-400 mt-0.5">✓</span>
              <div>
                <div className="text-xs font-semibold" style={{ color:'var(--text-primary)' }}>{item.title}</div>
                <div className="text-xs" style={{ color:'var(--text-muted)' }}>{item.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Architecture complexity chart */}
      {models.length > 0 && (
        <div className="kpi-card">
          <h3 className="text-sm font-semibold mb-3" style={{ color:'var(--text-primary)' }}>Model Complexity vs Accuracy (Pareto View)</h3>
          <p className="text-xs mb-3" style={{ color:'var(--text-muted)' }}>
            Simpler models are more interpretable. The logistic regression baseline (rank 18) has 65 parameters and 66.7% accuracy.
          </p>
          <Plot
            data={[{
              type:'scatter', mode:'markers+text',
              x:models.map(m=>m.parameters), y:models.map(m=>m.test_accuracy),
              text:models.map(m=>`#${m.rank}`),
              textposition:'top center' as const, textfont:{size:9,color:'#94a3b8'},
              marker:{
                color:models.map(m=>m.test_accuracy),
                colorscale:[[0,'#ef4444'],[0.5,'#f59e0b'],[1,'#22c55e']],
                size:12, showscale:true,
                colorbar:{title:{text:'Acc',font:{color:'#94a3b8',size:9}},tickfont:{color:'#94a3b8',size:9},thickness:10},
              },
              hovertemplate:'%{text}: %{y:.1%}<br>%{x:,} params<extra></extra>',
            }]}
            layout={{
              paper_bgcolor:'transparent', plot_bgcolor:'transparent',
              margin:{t:10,l:55,r:60,b:50}, height:280,
              xaxis:{color:'#94a3b8',title:{text:'Parameter Count',font:{color:'#94a3b8',size:11}}},
              yaxis:{color:'#94a3b8',range:[0,1.1],title:{text:'Test Accuracy',font:{color:'#94a3b8',size:11}}},
            }}
            config={{ displayModeBar: false }} style={{ width:'100%' }} />
        </div>
      )}
    </div>
  );
}
