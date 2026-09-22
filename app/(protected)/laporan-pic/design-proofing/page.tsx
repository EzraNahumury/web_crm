'use client';
import LaporanPicPage, { type PicSection } from '@/components/LaporanPicPage';

const SECTIONS: PicSection[] = [
  { title: 'Design', fields: [
    { key: 'design_qty', label: 'Qty', kind: 'number', suffix: 'cust' },
    { key: 'design_sla', label: 'Cust lewat SLA', kind: 'text', placeholder: '- / mis. 1, file tidak ada tracking' },
  ] },
  { title: 'Proofing', fields: [
    { key: 'proofing_qty', label: 'Qty', kind: 'number', suffix: 'cust' },
    { key: 'proofing_sla', label: 'Cust lewat SLA', kind: 'text', placeholder: '- / mis. 1, file tidak ada tracking' },
  ] },
  { title: 'Layouting', fields: [
    { key: 'layouting_qty', label: 'Qty', kind: 'number' },
  ] },
];

export default function LaporanDesignProofingPage() {
  return <LaporanPicPage jenis="design_proofing" title="Laporan Design, Proofing dan Layouting" sections={SECTIONS} />;
}
