'use client';
import { useEffect, useState } from 'react';

// Input angka desimal format Indonesia: menerima KOMA atau titik sebagai
// pemisah desimal (mis. "7,5" atau "7.5"). Ke parent dikirim nilai numerik
// (koma dinormalisasi ke titik); ke layar ditampilkan apa yang diketik user
// supaya bisa mengetik desimal dengan lancar (koma di akhir "7," tidak hilang).
//
// Dipakai di form yang input-nya kg/liter/meter (Forecasting & Real
// Pengeluaran Bahan). Ganti drop-in untuk <input inputMode="decimal">.
export function DecimalInput({
  value, onChange, className, placeholder, disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [text, setText] = useState<string>(fmtDecimal(value));

  // Resync teks lokal kalau `value` berubah dari LUAR (autofill, load, reset).
  // Skip kalau angka hasil parse teks sudah == value, supaya tidak menimpa
  // ketikan yang sedang berlangsung (mis. "7," yang parse-nya juga 7).
  useEffect(() => {
    if (parseDecimal(text) !== value) setText(fmtDecimal(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <input
      type="text"
      inputMode="decimal"
      value={text}
      disabled={disabled}
      placeholder={placeholder}
      className={className}
      onChange={e => {
        // Izinkan digit + koma/titik. Hanya 1 pemisah desimal.
        let raw = e.target.value.replace(/[^\d.,]/g, '');
        const firstSep = raw.search(/[.,]/);
        if (firstSep !== -1) {
          raw = raw.slice(0, firstSep + 1) + raw.slice(firstSep + 1).replace(/[.,]/g, '');
        }
        setText(raw);
        onChange(parseDecimal(raw));
      }}
      onBlur={() => setText(fmtDecimal(value))}
    />
  );
}

// "7,5" | "7.5" → 7.5 ; "" | invalid → 0
export function parseDecimal(t: string): number {
  const n = Number(String(t).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

// 7.5 → "7,5" ; 0/NaN → "" (biar placeholder muncul, sama seperti perilaku lama)
function fmtDecimal(n: number): string {
  if (!n || !Number.isFinite(n)) return '';
  return String(n).replace('.', ',');
}
