'use client';
import { useEffect, useState } from 'react';
const API = 'http://localhost:8080';

interface Run { run_id: string; }
interface Manifest { run_id?: string; model?: string; split?: string; item_count?: number; n_conditions?: number; python_version?: string; platform?: string; timestamp?: string; seed?: number; }
interface CondRow { condition: string; accuracy: string; trustworthiness_index: string; hallucination_rate: string; }

export default function ExperimentHistoryPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [manifests, setManifests] = useState<Record<string, Manifest>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [condData, setCondData] = useState<Record<string, CondRow[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/api/experiments`).then(r=>r.json()).then(async (r: Run[]) => {
      setRuns(r);
      const mfResults = await Promise.all(r.map(run =>
        fetch(`${API}/api/experiments/${run.run_id}/manifest`).then(x=>x.json()).then(mf=>({ run_id:run.run_id, mf })).catch(()=>({ run_id:run.run_id, mf:{} }))
      ));
      setManifests(Object.fromEntries(mfResults.map(x=>[x.run_id, x.mf])));
      setLoading(false);
    }).catch(()=>setLoading(false));
  }, []);

  async function toggleExpand(run_id: string) {
    if (expanded === run_id) { setExpanded(null); return; }
    setExpanded(run_id);
    if (!condData[run_id]) {
      const rows = await fetch(`${API}/api/experiments/${run_id}/condition-metrics`).then(r=>r.json()).catch(()=>[]);
      setCondData(prev => ({ ...prev, [run_id]: rows }));
    }
  }

  if (loading) return <div className="text-sm" style={{ color:'var(--text-muted)' }}>Loading experiment history...</div>;

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold" style={{ color:'var(--text-primary)' }}>Experiment History</h2>
        <p className="text-sm mt-1" style={{ color:'var(--text-muted)' }}>
          All {runs.length} completed experiment runs from the <code>outputs/</code> directory. Click a row to expand.
        </p>
      </div>

      {runs.length === 0 && (
        <div className="kpi-card"><p className="text-sm" style={{ color:'var(--text-muted)' }}>No experiment runs found.</p></div>
      )}

      <div className="space-y-3">
        {[...runs].reverse().map(run => {
          const mf = manifests[run.run_id] ?? {};
          const isExpanded = expanded === run.run_id;
          const conds = condData[run.run_id] ?? [];
          const fullMitcf = conds.find(c=>c.condition==='full_mitcf');
          const baseline = conds.find(c=>c.condition==='baseline');

          return (
            <div key={run.run_id} className="kpi-card" style={{ cursor:'pointer' }} onClick={()=>toggleExpand(run.run_id)}>
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-mono text-sm font-bold" style={{ color:'var(--accent)' }}>{run.run_id}</span>
                {mf.python_version && <span className="badge" style={{ background:'rgba(59,130,246,0.1)', color:'#93c5fd' }}>Python {mf.python_version}</span>}
                {mf.item_count !== undefined && <span className="text-xs" style={{ color:'var(--text-muted)' }}>{mf.item_count} items</span>}
                {mf.n_conditions !== undefined && <span className="text-xs" style={{ color:'var(--text-muted)' }}>{mf.n_conditions} conditions</span>}
                {mf.seed !== undefined && <span className="text-xs" style={{ color:'var(--text-muted)' }}>seed={mf.seed}</span>}
                <div className="ml-auto">
                  {isExpanded ? '▲ collapse' : '▼ expand'}
                </div>
              </div>

              {isExpanded && (
                <div className="mt-4 pt-4 border-t" style={{ borderColor:'var(--border)' }}>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <h4 className="text-xs font-semibold mb-2" style={{ color:'var(--text-primary)' }}>Manifest</h4>
                      <pre className="text-xs p-3 rounded overflow-auto" style={{ background:'rgba(0,0,0,0.3)', color:'#93c5fd', maxHeight:'180px' }}>
                        {JSON.stringify(mf, null, 2)}
                      </pre>
                    </div>
                    {conds.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold mb-2" style={{ color:'var(--text-primary)' }}>Quick Metrics</h4>
                        <table className="data-table" onClick={e=>e.stopPropagation()}>
                          <thead><tr><th>Condition</th><th>Accuracy</th><th>TI</th><th>Hall. Rate</th></tr></thead>
                          <tbody>
                            {conds.map(c=>(
                              <tr key={c.condition}>
                                <td className="font-mono text-xs">{c.condition}</td>
                                <td>{(parseFloat(c.accuracy)*100).toFixed(1)}%</td>
                                <td style={{ color:parseFloat(c.trustworthiness_index)>=0.8?'#22c55e':'#f59e0b', fontWeight:600 }}>{parseFloat(c.trustworthiness_index).toFixed(3)}</td>
                                <td style={{ color:parseFloat(c.hallucination_rate)<0.1?'#22c55e':'#ef4444' }}>{(parseFloat(c.hallucination_rate)*100).toFixed(1)}%</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {fullMitcf && baseline && (
                          <div className="mt-3 p-2 rounded text-xs" style={{ background:'rgba(34,197,94,0.08)', border:'1px solid rgba(34,197,94,0.2)' }}>
                            TI improvement: <span style={{ color:'#ef4444' }}>{parseFloat(baseline.trustworthiness_index).toFixed(3)}</span>
                            {' → '}
                            <span style={{ color:'#22c55e', fontWeight:700 }}>{parseFloat(fullMitcf.trustworthiness_index).toFixed(3)}</span>
                            <span style={{ color:'#22c55e' }}> (+{(parseFloat(fullMitcf.trustworthiness_index)-parseFloat(baseline.trustworthiness_index)).toFixed(3)})</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
