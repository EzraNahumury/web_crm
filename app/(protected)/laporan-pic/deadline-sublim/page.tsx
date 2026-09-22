'use client';
import LaporanPicPage, { type PicSection } from '@/components/LaporanPicPage';

const SECTIONS: PicSection[] = [
  { title: 'Delay Leadtime', fields: [
    { key: 'delay_cust', label: 'Data Cust', kind: 'text', placeholder: '- / daftar customer yang delay' },
    { key: 'delay_qty', label: 'Total Qty', kind: 'number' },
    { key: 'delay_point', label: 'Point', kind: 'number' },
  ] },
  { title: 'Sublim Press', fields: [
    { key: 'sublim_qty', label: 'Qty', kind: 'number', suffix: 'pcs' },
    { key: 'sublim_point', label: 'Point', kind: 'number', suffix: 'point' },
  ] },
];

export default function LaporanDeadlineSublimPage() {
  return <LaporanPicPage jenis="deadline_sublim" title="Laporan Deadline & Sublim Press" sections={SECTIONS} />;
}
