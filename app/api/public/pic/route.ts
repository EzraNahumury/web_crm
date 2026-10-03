import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

// Public (no-auth) feed untuk halaman visual per-PIC. Fokus Erick dulu
// (Printing + Press). Mengembalikan, per proses, realisasi poin per-hari untuk
// BULAN INI dan BULAN LALU (hanya hari yang ada data), supaya halaman bisa
// menyusun tabel harian (tgl/target/realisasi/selisih), perbandingan mingguan
// & bulanan, dan grafik. Target = 340 poin per hari kerja.

export const dynamic = 'force-dynamic';

const BASE_RATE_POIN = 5000;
const TARGET_POIN_HARIAN = 340;

interface PaketRate { prefix: string; ra: number; rc: number }

// PIC → daftar proses (tabel progress_* berbasis poin). PIC lain menyusul.
const PIC_CONFIG: Record<string, { label: string; processes: { table: string; label: string }[] }> = {
  erick: { label: 'Erick', processes: [{ table: 'progress_printing', label: 'Printing' }, { table: 'progress_press', label: 'Press' }] },
};

function parseData(raw: unknown): Record<string, number> {
  try {
    const o = JSON.parse(String(raw || '{}'));
    if (!o || typeof o !== 'object') return {};
    const out: Record<string, number> = {};
    for (const k of Object.keys(o)) out[k] = Number((o as Record<string, unknown>)[k]) || 0;
    return out;
  } catch { return {}; }
}
function poinOf(data: Record<string, number>, rates: PaketRate[]): { poin: number; pcs: number } {
  let poin = 0, pcs = 0;
  for (const r of rates) {
    const a = Number(data[`${r.prefix}_atasan`]) || 0;
    const c = Number(data[`${r.prefix}_celana`]) || 0;
    poin += a * (r.ra / BASE_RATE_POIN) + c * (r.rc / BASE_RATE_POIN);
    pcs += a + c;
  }
  return { poin, pcs };
}
function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const MON_FULL = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
function monthLabel(ym: string): string { const [y, m] = ym.split('-').map(Number); return `${MON_FULL[(m || 1) - 1]} ${y}`; }

type ProgRow = { tanggal: unknown; realisasi_json: unknown };
type DayAgg = { date: string; real: number; pcs: number };

// Agregasi per-hari (hanya hari dengan data) untuk rentang tanggal.
function aggregateByDay(rows: ProgRow[], rates: PaketRate[], ymFilter: string): DayAgg[] {
  const map = new Map<string, { real: number; pcs: number }>();
  for (const r of rows) {
    const iso = String(r.tanggal instanceof Date ? r.tanggal.toISOString() : r.tanggal).slice(0, 10);
    if (iso.slice(0, 7) !== ymFilter) continue;
    const { poin, pcs } = poinOf(parseData(r.realisasi_json), rates);
    const cur = map.get(iso) || { real: 0, pcs: 0 };
    cur.real += poin; cur.pcs += pcs;
    map.set(iso, cur);
  }
  return Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, v]) => ({ date, real: Math.round(v.real * 10) / 10, pcs: v.pcs }));
}

export async function GET(req: NextRequest) {
  try {
    const pic = String(new URL(req.url).searchParams.get('pic') || 'erick').toLowerCase();
    const config = PIC_CONFIG[pic];
    if (!config) return NextResponse.json({ success: false, error: 'PIC tidak dikenal' }, { status: 400 });

    const now = new Date();
    const curYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevYm = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
    const winStart = `${prevYm}-01`;
    const winEnd = isoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0)); // akhir bulan ini

    const paketRows = await query<{ kolom_prefix: string; rate_atasan: number; rate_celana: number }>(
      'SELECT kolom_prefix, rate_atasan, rate_celana FROM line_jahit_paket ORDER BY urutan ASC'
    );
    const rates: PaketRate[] = paketRows.map(p => ({
      prefix: String(p.kolom_prefix), ra: Number(p.rate_atasan) || BASE_RATE_POIN, rc: Number(p.rate_celana) || BASE_RATE_POIN,
    }));

    const processes = await Promise.all(config.processes.map(async proc => {
      let rows: ProgRow[] = [];
      try {
        rows = await query<ProgRow>(
          `SELECT tanggal, realisasi_json FROM \`${proc.table}\` WHERE tanggal BETWEEN ? AND ?`,
          [winStart, winEnd]
        );
      } catch { rows = []; }
      return {
        key: proc.table.replace('progress_', ''),
        label: proc.label,
        days: aggregateByDay(rows, rates, curYm),
        prevDays: aggregateByDay(rows, rates, prevYm),
      };
    }));

    return NextResponse.json({
      success: true,
      pic, picLabel: config.label,
      target: TARGET_POIN_HARIAN,
      month: curYm, monthLabel: monthLabel(curYm),
      prevMonth: prevYm, prevMonthLabel: monthLabel(prevYm),
      generatedAt: new Date().toISOString(),
      processes,
    });
  } catch (err) {
    console.error('public/pic error:', err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
