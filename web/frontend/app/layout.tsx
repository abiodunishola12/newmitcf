'use client';

import './globals.css';
import { useState } from 'react';
import Sidebar from '../components/Sidebar';
import TopBar from '../components/TopBar';
import { usePathname } from 'next/navigation';

const PAGE_TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/research-overview': 'Research Overview',
  '/mitcf-framework': 'Developed MITCF Framework',
  '/system-architecture': 'System Architecture',
  '/deep-learning': 'Deep Learning Models',
  '/neural-architecture': 'Neural Network Architecture',
  '/training-config': 'Training Configuration',
  '/training-monitor': 'Real-Time Training Monitor',
  '/hyperparameters': 'Hyperparameter Optimization',
  '/fuzzy-inference': 'Fuzzy Inference System',
  '/fuzzy-sets': 'Fuzzy Sets',
  '/membership-functions': 'Membership Functions',
  '/fuzzy-rules': 'Fuzzy Rule Base',
  '/defuzzification': 'Fuzzification and Defuzzification',
  '/control-surface': 'Fuzzy Control Surface',
  '/model-evaluation': 'Model Evaluation',
  '/performance-metrics': 'Performance Metrics',
  '/model-comparison': 'Model Comparison',
  '/statistical-analysis': 'Statistical Analysis',
  '/inference-controls': 'Inference-Time Controls',
  '/trustworthiness': 'Trustworthiness Evaluation',
  '/adversarial': 'Adversarial Robustness',
  '/agent-decisions': 'Agent Decision Monitoring',
  '/explainability': 'Explainable AI',
  '/ablation': 'Ablation Studies',
  '/experiment-config': 'Experiment Configuration',
  '/run-experiment': 'Run Experiments',
  '/experiment-monitor': 'Live Experiment Monitor',
  '/experiment-history': 'Experiment History',
  '/results': 'Results and Visualizations',
  '/datasets': 'Dataset Management',
  '/system-monitoring': 'GPU and System Monitoring',
  '/reports': 'Research Reports',
  '/settings': 'Settings',
  '/visual-perception': 'Visual Perception Overview',
  '/visual-perception/pope': 'POPE Hallucination Evaluation',
  '/visual-perception/mme': 'MME Perception Evaluation',
  '/visual-perception/conditions': 'Condition Comparison',
  '/visual-perception/trustworthiness': 'VP Trustworthiness Index',
  '/visual-perception/robustness': 'VP Adversarial Robustness',
  '/visual-perception/run': 'Run Visual-Perception Evaluation',
  '/visual-perception/datasets': 'Dataset Setup',
};

function ClientLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const title = PAGE_TITLES[pathname] || 'MITCF Research Platform';
  const sidebarWidth = collapsed ? 64 : 260;

  return (
    <html lang="en">
      <head>
        <title>MITCF Research Platform</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body>
        <Sidebar collapsed={collapsed} />
        <TopBar onToggleSidebar={() => setCollapsed(!collapsed)} title={title} />
        <main
          className="transition-all duration-300"
          style={{
            marginLeft: sidebarWidth,
            marginTop: 56,
            minHeight: 'calc(100vh - 56px)',
            padding: '24px',
          }}
        >
          {children}
        </main>
      </body>
    </html>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <ClientLayout>{children}</ClientLayout>;
}
