'use client';
import LaporanPicPage, { parsePicNum, fmtPicNum, type PicSection } from '@/components/LaporanPicPage';

const SECTIONS: PicSection[] = [
  { title: 'Sewing — Line', fields: [
    { key: 'line_qty', label: 'Qty', kind: 'number' },
    { key: 'line_point', label: 'Point', kind: 'number' },
  ] },
  { title: 'Sewing — Borongan', fields: [
    { key: 'borongan_qty', label: 'Qty', kind: 'number' },
    { key: 'borongan_point', label: 'Point', kind: 'number' },
  ] },
  { title: 'Sewing — CMT', fields: [
    { key: 'cmt_qty', label: 'Qty', kind: 'number' },
    { key: 'cmt_point', label: 'Point', kind: 'number' },
  ] },
  { title: 'Grand Total Sewing', fields: [], computed: d => [
    { label: 'Qty', value: fmtPicNum(parsePicNum(d.line_qty) + parsePicNum(d.borongan_qty) + parsePicNum(d.cmt_qty)) },
    { label: 'Point', value: fmtPicNum(parsePicNum(d.line_point) + parsePicNum(d.borongan_point) + parsePicNum(d.cmt_point)) },
  ] },
  { title: 'Shipment', fields: [
    { key: 'shipment_tgl', label: 'Tgl Shipment', kind: 'text', placeholder: 'mis. 17 Sept' },
    { key: 'shipment_qty', label: 'Qty', kind: 'number' },
    { key: 'shipment_point', label: 'Point', kind: 'number' },
  ] },
];

export default function LaporanSewingShipmentPage() {
  return <LaporanPicPage jenis="sewing_shipment" title="Laporan Sewing & Shipment" sections={SECTIONS} />;
}
