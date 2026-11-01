'use client';
import { useState, useEffect } from 'react';

const API = 'http://localhost:8080';

interface POPEStatus {
  ready: boolean; annotations_found: boolean;
  annotation_files: Record<string, boolean>;
  image_count: number; images_found: boolean;
}
interface MMEStatus {
  ready: boolean; categories_found: number; categories_total: number;
  category_status: Record<string, boolean>;
}
interface DatasetStatus { pope: POPEStatus; mme: MMEStatus; }

const POPE_STEPS = [
  { title: 'Clone POPE annotations', code: 'git clone https://github.com/AoiDragon/POPE.git\ncp POPE/output/coco/coco_pope_random.json     data/pope/annotations/\ncp POPE/output/coco/coco_pope_popular.json    data/pope/annotations/\ncp POPE/output/coco/coco_pope_adversarial.json data/pope/annotations/' },
  { title: 'Download MSCOCO val2014 (~6.6 GB)', code: 'wget http://images.cocodataset.org/zips/val2014.zip\nunzip val2014.zip -d data/pope/' },
  { title: 'Verify', code: 'python -m visual_perception.cli validate-data' },
];

const MME_STEPS = [
  { title: 'Request access', code: 'Visit: https://github.com/BradyFU/Awesome-Multimodal-Large-Language-Models/tree/Evaluation\nFollow the download link in the README.' },
  { title: 'Extract to data/mme/', code: '# After downloading the archive:\nunzip MME_Benchmark.zip -d data/mme/' },
  { title: 'Verify', code: 'python -m visual_perception.cli validate-data' },
];

const MME_CATEGORIES = [
  'existence', 'count', 'position', 'color', 'posters', 'celebrity',
  'scene', 'landmark', 'artwork', 'OCR',
  'commonsense_reasoning', 'numerical_calculation', 'text_translation', 'code_reasoning',
];

export default function VPDatasetsPage() {
  const [status, setStatus] = useState<DatasetStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState<string>('');

  useEffect(() => {
    fetch(`${API}/api/visual-perception/dataset-status`)
      .then(r => r.json()).then(setStatus)
      .catch(e => setErr(String(e)))
      .finally(() => setLoading(false));
  }, []);

  function copy(text: string, id: string) {
    try { navigator.clipboard.writeText(text).then(() => { setCopied(id); setTimeout(() => setCopied(''), 2000); }); }
    catch { setCopied(''); }
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Dataset Setup</h2>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
          Download status for POPE + MME benchmark datasets. Follow the steps below if a dataset is marked Not ready.
        </p>
      </div>

      {loading && <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Checking dataset statusâ€¦</div>}
      {err && <div className="text-xs mb-4 p-2 rounded" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>{err}</div>}

      {status && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* POPE */}
          <div>
            <StatusHeader title="POPE Dataset" ready={status.pope.ready} />
            <div className="kpi-card mb-4">
              <h4 className="text-xs font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>File Status</h4>
              <div className="space-y-1 text-xs">
                {Object.entries(status.pope.annotation_files).map(([f, found]) => (
                  <div key={f} className="flex justify-between">
                    <code style={{ color: 'var(--text-secondary)' }}>{f}.json</code>
                    <span style={{ color: found ? '#22c55e' : '#ef4444' }}>{found ? 'âœ" found' : 'âœ— missing'}</span>
                  </div>
                ))}
                <div className="flex justify-between pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>val2014 images</span>
                  <span style={{ color: status.pope.images_found ? '#22c55e' : '#ef4444' }}>
                    {status.pope.images_found ? `âœ" ${status.pope.image_count.toLocaleString()} images` : 'âœ— missing'}
                  </span>
                </div>
              </div>
            </div>
            {!status.pope.ready && (
              <div className="space-y-3">
                {POPE_STEPS.map((step, i) => (
                  <InstructionCard key={i} step={i + 1} title={step.title} code={step.code}
                    onCopy={() => copy(step.code, `pope-${i}`)} copied={copied === `pope-${i}`} />
                ))}
              </div>
            )}
            {status.pope.ready && <ReadyBanner text="POPE is ready. You can run the smoke test." />}
          </div>

          {/* MME */}
          <div>
            <StatusHeader title="MME Dataset" ready={status.mme.ready} />
            <div className="kpi-card mb-4">
              <h4 className="text-xs font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Category Status</h4>
              <div className="grid grid-cols-2 gap-1 text-xs">
                {MME_CATEGORIES.map(c => (
                  <div key={c} className="flex justify-between">
                    <code style={{ color: 'var(--text-secondary)' }}>{c}</code>
                    <span style={{ color: status.mme.category_status[c] ? '#22c55e' : '#64748b' }}>
                      {status.mme.category_status[c] ? 'âœ"' : 'â€"'}
                    </span>
                  </div>
                ))}
              </div>
              <div className="text-xs mt-3 pt-2 border-t font-semibold" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
                {status.mme.categories_found} / {status.mme.categories_total} categories found
              </div>
            </div>
            {!status.mme.ready && (
              <div className="space-y-3">
                {MME_STEPS.map((step, i) => (
                  <InstructionCard key={i} step={i + 1} title={step.title} code={step.code}
                    onCopy={() => copy(step.code, `mme-${i}`)} copied={copied === `mme-${i}`} />
                ))}
              </div>
            )}
            {status.mme.ready && <ReadyBanner text="MME is ready." />}
          </div>
        </div>
      )}

      {/* Model note */}
      <div className="kpi-card mt-6" style={{ borderLeft: '3px solid #f59e0b' }}>
        <h4 className="text-sm font-semibold mb-2" style={{ color: '#f59e0b' }}>Model Weights</h4>
        <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
          <strong>Qwen/Qwen2.5-VL-3B-Instruct</strong> (~7 GB) downloads automatically on first <code>smoke-test</code> run.
          Alternatively, pre-download with:
        </p>
        <pre className="text-xs p-3 rounded overflow-x-auto" style={{ background: 'rgba(0,0,0,0.3)', color: '#93c5fd' }}>
          huggingface-cli download Qwen/Qwen2.5-VL-3B-Instruct
        </pre>
        <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
          If RTX 3050 OOM at float16 (~5.5 GB), set <code>load_in_4bit: true</code> in
          <code>visual_perception/config/default_config.yaml</code> (~2 GB, requires bitsandbytes).
        </p>
      </div>
    </div>
  );
}

function StatusHeader({ title, ready }: { title: string; ready: boolean }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>{title}</h3>
      <span className="badge text-xs font-bold" style={{
        background: ready ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
        color: ready ? '#22c55e' : '#ef4444', padding: '2px 10px',
      }}>
        {ready ? 'âœ" Ready' : 'âœ— Not ready'}
      </span>
    </div>
  );
}

function InstructionCard({ step, title, code, onCopy, copied }: { step: number; title: string; code: string; onCopy: () => void; copied: boolean }) {
  return (
    <div className="kpi-card">
      <div className="flex items-center gap-2 mb-2">
        <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
          style={{ background: 'var(--accent)', color: 'white' }}>{step}</span>
        <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</span>
      </div>
      <div className="relative">
        <pre className="text-xs p-3 rounded overflow-x-auto" style={{ background: 'rgba(0,0,0,0.3)', color: '#93c5fd', margin: 0 }}>{code}</pre>
        <button onClick={onCopy}
          className="absolute top-2 right-2 text-xs px-2 py-0.5 rounded"
          style={{ background: 'rgba(255,255,255,0.1)', color: copied ? '#22c55e' : 'var(--text-muted)', border: '1px solid var(--border)' }}>
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
    </div>
  );
}

function ReadyBanner({ text }: { text: string }) {
  return (
    <div className="p-3 rounded text-xs" style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', color: '#22c55e' }}>
      âœ" {text}
    </div>
  );
}
