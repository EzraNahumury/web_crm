'use client';

// Papan gabungan /progress/all — menampilkan KEEMPAT laporan PIC sebagai satu
// visual SLIDESHOW: satu proses per slide (tabel harian + grafik + perbandingan
// mingguan & bulanan), bisa dipindah manual (tab proses / ‹ ›) atau otomatis
// tiap 20 detik. Data dari /api/public/pic?pic=all. Publik, tema terang.

import PicVisual from '@/components/progress/PicVisual';

export default function ProgressAllPage() {
  return <PicVisual pic="all" slideshow />;
}
