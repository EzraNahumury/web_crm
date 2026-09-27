'use client';
import ProgressLinePage from '@/components/ProgressLinePage';

export default function ProgressCuttingPage() {
  return <ProgressLinePage table="progress_cutting" title="Progress Cutting" accent="orange"
    ops={{ mode: 'cutting', slaDays: 1, recap: true }} />;
}
