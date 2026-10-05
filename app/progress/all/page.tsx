'use client';

// Papan gabungan /progress/all — menampilkan KEEMPAT laporan PIC sebagai satu
// visual, ditampilkan per-step (tiap proses punya section sendiri: tabel
// harian + grafik + perbandingan mingguan & bulanan). Data dari
// /api/public/pic?pic=all. Publik (tanpa login), tema terang.

import PicVisual from '@/components/progress/PicVisual';

export default function ProgressAllPage() {
  return <PicVisual pic="all" />;
}
