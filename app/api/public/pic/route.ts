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

// source:
//   'json'    — tabel progress_* dengan kolom realisasi_json
//   'columns' — tabel line_jahit (qty paket di kolom langsung ${prefix}_atasan/celana)
interface ProcCfg { table: string; label: string; source: 'json' | 'columns' }
const PIC_CONFIG: Record<string, { label: string; processes: ProcCfg[] }> = {
  erick: { label: 'Erick', processes: [{ table: 'progress_printing', label: 'Printing', source: 'json' }, { table: 'progress_press', label: 'Press', source: 'json' }] },
  amboss: { label: 'Amboss', processes: [{ table: 'progress_cutting', label: 'Cutting', source: 'json' }, { table: 'line_jahit', label: 'Sewing', source: 'columns' }] },
  intan: { label: 'Intan', processes: [{ table: 'progress_finishing', label: 'Finishing', source: 'json' }, { table: 'progress_shipment', label: 'Shipment', source: 'json' }] },
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

type DayAgg = { date: string; real: number; pcs: number };

// Ambil data poin dari satu baris sesuai sumber-nya.
function rowData(r: Record<string, unknown>, rates: PaketRate[], source: 'json' | 'columns'): Record<string, number> {
  if (source === 'columns') {
    const data: Record<string, number> = {};
    for (const rt of rates) {
      data[`${rt.prefix}_atasan`] = Number(r[`${rt.prefix}_atasan`]) || 0;
      data[`${rt.prefix}_celana`] = Number(r[`${rt.prefix}_celana`]) || 0;
    }
    return data;
  }
  return parseData(r.realisasi_json);
}

// Agregasi per-hari (hanya hari dengan data) untuk rentang tanggal.
function aggregateByDay(rows: Record<string, unknown>[], rates: PaketRate[], ymFilter: string, source: 'json' | 'columns'): DayAgg[] {
  const map = new Map<string, { real: number; pcs: number }>();
  for (const r of rows) {
    const t = r.tanggal;
    const iso = String(t instanceof Date ? t.toISOString() : t).slice(0, 10);
    if (iso.slice(0, 7) !== ymFilter) continue;
    const { poin, pcs } = poinOf(rowData(r, rates, source), rates);
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
      let rows: Record<string, unknown>[] = [];
      try {
        const sql = proc.source === 'columns'
          ? `SELECT * FROM \`${proc.table}\` WHERE tanggal BETWEEN ? AND ?`
          : `SELECT tanggal, realisasi_json FROM \`${proc.table}\` WHERE tanggal BETWEEN ? AND ?`;
        rows = await query<Record<string, unknown>>(sql, [winStart, winEnd]);
      } catch { rows = []; }
      return {
        key: proc.table.replace('progress_', ''),
        label: proc.label,
        days: aggregateByDay(rows, rates, curYm, proc.source),
        prevDays: aggregateByDay(rows, rates, prevYm, proc.source),
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
