'use client';
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';

const Plot = dynamic(() => import('react-plotly.js'), { ssr: false });
const API = 'http://localhost:8080';

interface Curve { label: string; x: number[]; y: number[]; }
interface MFData { type: string; description: string; curves: Curve[]; }
interface MembershipAt { type: string; input_value: number; memberships: Record<string, number>; }

const CURVE_COLORS = ['#3b82f6','#22c55e','#f59e0b'];

function normalizeMF(raw: any): MFData {
  const curvesDict = raw.curves as Record<string, { x: number; y: number }[]>;
  const curves: Curve[] = Object.entries(curvesDict).map(([label, points]) => ({
    label,
    x: points.map((p) => p.x),
    y: points.map((p) => p.y),
  }));
  return { type: raw.type, description: raw.description, curves };
}

export default function MembershipFunctionsPage() {
  const [qualMF, setQualMF] = useState<MFData | null>(null);
  const [riskMF, setRiskMF] = useState<MFData | null>(null);
  const [probeQual, setProbeQual] = useState(0.6);
  const [probeRisk, setProbeRisk] = useState(0.3);
  const [atQual, setAtQual] = useState<MembershipAt | null>(null);
  const [atRisk, setAtRisk] = useState<MembershipAt | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`${API}/api/fuzzy/membership-curves/quality`).then(r => r.json()),
      fetch(`${API}/api/fuzzy/membership-curves/risk`).then(r => r.json()),
    ]).then(([q, r]) => { setQualMF(normalizeMF(q)); setRiskMF(normalizeMF(r)); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetch(`${API}/api/fuzzy/membership-at/quality/${probeQual}`).then(r => r.json()).then(setAtQual).catch(() => {});
  }, [probeQual]);

  useEffect(() => {
    fetch(`${API}/api/fuzzy/membership-at/risk/${probeRisk}`).then(r => r.json()).then(setAtRisk).catch(() => {});
  }, [probeRisk]);

  function buildPlot(mf: MFData, probeVal: number, atData: MembershipAt | null) {
    const curveTraces = (mf.curves ?? []).map((c, i) => ({
      type: 'scatter' as const, mode: 'lines' as const, name: c.label,
      x: c.x, y: c.y, line: { color: CURVE_COLORS[i % CURVE_COLORS.length], width: 2 },
    }));
    const annotations = atData ? Object.entries(atData.memberships).map(([k, v], i) => ({
      x: probeVal, y: v, xref: 'x' as const, yref: 'y' as const,
      text: `${k}: ${v.toFixed(2)}`, showarrow: true, arrowhead: 2,
      font: { size: 9, color: CURVE_COLORS[i % CURVE_COLORS.length] },
      arrowcolor: CURVE_COLORS[i % CURVE_COLORS.length], ax: 30, ay: -20 - i * 15,
    })) : [];
    return { curveTraces, annotations };
  }

  const pl = {
    paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
    margin: { t: 10, l: 45, r: 10, b: 45 }, height: 280,
    xaxis: { color: '#94a3b8', range: [0, 1], title: { text: 'Input Value', font: { color: '#94a3b8', size: 11 } } },
    yaxis: { color: '#94a3b8', range: [0, 1.1], title: { text: 'Membership Degree', font: { color: '#94a3b8', size: 11 } } },
    legend: { font: { color: '#94a3b8', size: 10 }, bgcolor: 'transparent' },
  };

  if (loading) return <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading membership functions...</div>;

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Membership Functions</h2>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
          Triangular/trapezoidal membership functions for quality-type (quality, safety, efficiency) and risk-type (risk, uncertainty) inputs.
          Use the sliders to probe membership degrees at a specific input value.
        </p>
      </div>

      {/* Quality-type */}
      {qualMF && (
        <div className="kpi-card mb-6">
          <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Quality-Type Variables (quality, safety, efficiency)</h3>
          <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>Applies to: quality, safety, efficiency. Low [0,0.4], Medium [0.3,0.7], High [0.6,1.0]</p>
          <div className="flex items-center gap-3 mb-3">
            <label className="text-xs" style={{ color: 'var(--text-muted)' }}>Probe value:</label>
            <input type="range" min={0} max={1} step={0.01} value={probeQual}
              onChange={e => setProbeQual(parseFloat(e.target.value))} className="flex-1" />
            <span className="text-xs font-mono w-10 text-right" style={{ color: '#3b82f6' }}>{probeQual.toFixed(2)}</span>
          </div>
          {atQual && (
            <div className="flex gap-3 mb-3">
              {Object.entries(atQual.memberships).map(([k, v], i) => (
                <div key={k} className="px-3 py-1.5 rounded text-center" style={{ background: `${CURVE_COLORS[i % 3]}22`, border: `1px solid ${CURVE_COLORS[i % 3]}44` }}>
                  <div className="text-xs" style={{ color: CURVE_COLORS[i % 3] }}>{k}</div>
                  <div className="text-sm font-bold" style={{ color: CURVE_COLORS[i % 3] }}>{v.toFixed(3)}</div>
                </div>
              ))}
            </div>
          )}
          <Plot
            data={[
              ...((qualMF.curves ?? []).map((c, i) => ({
                type: 'scatter' as const, mode: 'lines' as const, name: c.label,
                x: c.x, y: c.y, line: { color: CURVE_COLORS[i % CURVE_COLORS.length], width: 2 },
              }))),
              { type: 'scatter' as const, mode: 'lines' as const, name: 'Probe', showlegend: false,
                x: [probeQual, probeQual], y: [0, 1], line: { color: '#ffffff', width: 1, dash: 'dash' } },
            ]}
            layout={{ ...pl, annotations: buildPlot(qualMF, probeQual, atQual).annotations }}
            config={{ displayModeBar: true, displaylogo: false }} style={{ width: '100%' }} />
        </div>
      )}

      {/* Risk-type */}
      {riskMF && (
        <div className="kpi-card mb-6">
          <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Risk-Type Variables (risk, uncertainty)</h3>
          <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>Applies to: risk, uncertainty. Low [0,0.4], Medium [0.3,0.7], High [0.6,1.0]</p>
          <div className="flex items-center gap-3 mb-3">
            <label className="text-xs" style={{ color: 'var(--text-muted)' }}>Probe value:</label>
            <input type="range" min={0} max={1} step={0.01} value={probeRisk}
              onChange={e => setProbeRisk(parseFloat(e.target.value))} className="flex-1" />
            <span className="text-xs font-mono w-10 text-right" style={{ color: '#3b82f6' }}>{probeRisk.toFixed(2)}</span>
          </div>
          {atRisk && (
            <div className="flex gap-3 mb-3">
              {Object.entries(atRisk.memberships).map(([k, v], i) => (
                <div key={k} className="px-3 py-1.5 rounded text-center" style={{ background: `${CURVE_COLORS[i % 3]}22`, border: `1px solid ${CURVE_COLORS[i % 3]}44` }}>
                  <div className="text-xs" style={{ color: CURVE_COLORS[i % 3] }}>{k}</div>
                  <div className="text-sm font-bold" style={{ color: CURVE_COLORS[i % 3] }}>{v.toFixed(3)}</div>
                </div>
              ))}
            </div>
          )}
          <Plot
            data={[
              ...((riskMF.curves ?? []).map((c, i) => ({
                type: 'scatter' as const, mode: 'lines' as const, name: c.label,
                x: c.x, y: c.y, line: { color: CURVE_COLORS[i % CURVE_COLORS.length], width: 2 },
              }))),
              { type: 'scatter' as const, mode: 'lines' as const, name: 'Probe', showlegend: false,
                x: [probeRisk, probeRisk], y: [0, 1], line: { color: '#ffffff', width: 1, dash: 'dash' } },
            ]}
            layout={{ ...pl, annotations: buildPlot(riskMF, probeRisk, atRisk).annotations }}
            config={{ displayModeBar: true, displaylogo: false }} style={{ width: '100%' }} />
        </div>
      )}

      {/* Technical spec */}
      <div className="kpi-card" style={{ borderLeft: '3px solid #a855f7' }}>
        <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Implementation Details</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs" style={{ color: 'var(--text-secondary)' }}>
          <div>
            <div className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Quality-type shape</div>
            <pre className="p-2 rounded text-xs overflow-auto" style={{ background:'rgba(0,0,0,0.3)', color:'#93c5fd' }}>{`low:    trap [0, 0, 0.2, 0.4]\nmedium: tri  [0.3, 0.5, 0.7]\nhigh:   trap [0.6, 0.8, 1, 1]`}</pre>
          </div>
          <div>
            <div className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Risk-type shape</div>
            <pre className="p-2 rounded text-xs overflow-auto" style={{ background:'rgba(0,0,0,0.3)', color:'#93c5fd' }}>{`low:    trap [0, 0, 0.2, 0.4]\nmedium: tri  [0.3, 0.5, 0.7]\nhigh:   trap [0.6, 0.8, 1, 1]`}</pre>
          </div>
        </div>
        <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>Source: <code>mitcf_pipeline/fuzzy_gate.py</code> — <code>_quality_membership()</code>, <code>_risk_membership()</code></p>
      </div>
    </div>
  );
}
