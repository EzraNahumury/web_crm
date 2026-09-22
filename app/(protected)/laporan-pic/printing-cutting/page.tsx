'use client';
import LaporanPicPage, { type PicSection } from '@/components/LaporanPicPage';

const SECTIONS: PicSection[] = [
  { title: 'Printing', fields: [
    { key: 'printing_qty', label: 'Qty', kind: 'number' },
    { key: 'printing_point', label: 'Point', kind: 'number' },
  ] },
  { title: 'QC Cutting', fields: [
    { key: 'cutting_customer', label: 'Customer', kind: 'number' },
    { key: 'cutting_point', label: 'Point', kind: 'number' },
  ] },
];

export default function LaporanPrintingCuttingPage() {
  return <LaporanPicPage jenis="printing_cutting" title="Laporan Print dan QC Cutting" sections={SECTIONS} />;
}
