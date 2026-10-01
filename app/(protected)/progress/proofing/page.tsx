'use client';
import SimpleProgressPage from '@/components/SimpleProgressPage';

// Opsi status revisi untuk laporan pekerjaan dari customer.
const REVISI_KET = ['Desain Awal', 'Revisi 1', 'Revisi 2', 'Revisi 3', 'Revisi Tambahan'];

export default function ProgressProofingPage() {
  return <SimpleProgressPage table="progress_proofing" title="Progress Proofing" accent="teal" ketOptions={REVISI_KET} />;
}
