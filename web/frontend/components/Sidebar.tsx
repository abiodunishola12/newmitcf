'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, BookOpen, Layers, Network, Brain, Settings2,
  Activity, Sliders, Sigma, List, BarChart3, GitCompare, TestTube,
  Shield, Target, Swords, Eye, Beaker, FlaskConical, MonitorDot,
  History, BarChart2, Database, Cpu, FileText, Settings, ChevronRight,
  ScanEye, Image, Grid3x3, Zap, Radar, PlayCircle, CheckSquare
} from 'lucide-react';

const NAV_SECTIONS = [
  {
    title: 'MAIN',
    items: [
      { label: 'Dashboard', href: '/', icon: LayoutDashboard },
      { label: 'Research Overview', href: '/research-overview', icon: BookOpen },
      { label: 'MITCF Framework', href: '/mitcf-framework', icon: Layers },
      { label: 'System Architecture', href: '/system-architecture', icon: Network },
    ],
  },
  {
    title: 'DEEP LEARNING',
    items: [
      { label: 'Deep Learning Models', href: '/deep-learning', icon: Brain },
      { label: 'Neural Architecture', href: '/neural-architecture', icon: Network },
      { label: 'Training Config', href: '/training-config', icon: Settings2 },
      { label: 'Real-Time Training', href: '/training-monitor', icon: Activity },
      { label: 'Hyperparameters', href: '/hyperparameters', icon: Sliders },
    ],
  },
  {
    title: 'FUZZY LOGIC',
    items: [
      { label: 'Fuzzy Inference System', href: '/fuzzy-inference', icon: Sigma },
      { label: 'Fuzzy Sets', href: '/fuzzy-sets', icon: List },
      { label: 'Membership Functions', href: '/membership-functions', icon: BarChart3 },
      { label: 'Fuzzy Rule Base', href: '/fuzzy-rules', icon: List },
      { label: 'Fuzzification / Defuzz', href: '/defuzzification', icon: GitCompare },
      { label: 'Control Surface', href: '/control-surface', icon: BarChart2 },
    ],
  },
  {
    title: 'MODEL EVALUATION',
    items: [
      { label: 'Model Evaluation', href: '/model-evaluation', icon: TestTube },
      { label: 'Performance Metrics', href: '/performance-metrics', icon: BarChart3 },
      { label: 'Model Comparison', href: '/model-comparison', icon: GitCompare },
      { label: 'Statistical Analysis', href: '/statistical-analysis', icon: BarChart2 },
    ],
  },
  {
    title: 'MITCF RESEARCH',
    items: [
      { label: 'Inference-Time Controls', href: '/inference-controls', icon: Sliders },
      { label: 'Trustworthiness', href: '/trustworthiness', icon: Shield },
      { label: 'Adversarial Robustness', href: '/adversarial', icon: Swords },
      { label: 'Agent Decision Monitor', href: '/agent-decisions', icon: Target },
      { label: 'Explainable AI', href: '/explainability', icon: Eye },
      { label: 'Ablation Studies', href: '/ablation', icon: Beaker },
    ],
  },
  {
    title: 'EXPERIMENTS',
    items: [
      { label: 'Experiment Config', href: '/experiment-config', icon: Settings2 },
      { label: 'Run Experiments', href: '/run-experiment', icon: FlaskConical },
      { label: 'Live Monitor', href: '/experiment-monitor', icon: MonitorDot },
      { label: 'Experiment History', href: '/experiment-history', icon: History },
      { label: 'Results & Visualizations', href: '/results', icon: BarChart3 },
    ],
  },
  {
    title: 'VISUAL PERCEPTION',
    items: [
      { label: 'VP Overview', href: '/visual-perception', icon: ScanEye },
      { label: 'POPE Evaluation', href: '/visual-perception/pope', icon: Image },
      { label: 'MME Evaluation', href: '/visual-perception/mme', icon: Grid3x3 },
      { label: 'Condition Comparison', href: '/visual-perception/conditions', icon: GitCompare },
      { label: 'VP Trustworthiness', href: '/visual-perception/trustworthiness', icon: Radar },
      { label: 'VP Robustness', href: '/visual-perception/robustness', icon: Zap },
      { label: 'Run VP Evaluation', href: '/visual-perception/run', icon: PlayCircle },
      { label: 'Dataset Setup', href: '/visual-perception/datasets', icon: CheckSquare },
    ],
  },
  {
    title: 'SYSTEM',
    items: [
      { label: 'Dataset Management', href: '/datasets', icon: Database },
      { label: 'GPU & System Monitor', href: '/system-monitoring', icon: Cpu },
      { label: 'Research Reports', href: '/reports', icon: FileText },
      { label: 'Settings', href: '/settings', icon: Settings },
    ],
  },
];

export default function Sidebar({ collapsed }: { collapsed: boolean }) {
  const pathname = usePathname();

  return (
    <aside
      className="fixed left-0 top-0 h-full z-40 flex flex-col transition-all duration-300 overflow-hidden"
      style={{
        width: collapsed ? 64 : 260,
        background: 'var(--bg-secondary)',
        borderRight: '1px solid var(--border)',
      }}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-4 border-b" style={{ borderColor: 'var(--border)', minHeight: 56 }}>
        <div className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold"
          style={{ background: 'var(--accent)' }}>
          M
        </div>
        {!collapsed && (
          <div>
            <div className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>MITCF</div>
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Research Platform</div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-2 px-2" style={{ scrollbarWidth: 'thin' }}>
        {NAV_SECTIONS.map((section) => (
          <div key={section.title}>
            {!collapsed && (
              <div className="section-header">{section.title}</div>
            )}
            {section.items.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link key={item.href} href={item.href} className={`sidebar-nav-item ${isActive ? 'active' : ''}`}
                  title={collapsed ? item.label : ''}>
                  <Icon size={16} className="flex-shrink-0" />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}
