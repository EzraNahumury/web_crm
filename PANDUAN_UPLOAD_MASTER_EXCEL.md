# Panduan Upload Master Excel — Work Order

Panduan untuk **admin produksi** mengenai cara upload satu file Excel master yang otomatis terdistribusi ke WO 1, WO 2, WO 3, dan WO 4 di CRM.

---

## Apa itu Upload Master Excel?

Daripada input data WO 1–4 satu per satu lewat form, sekarang **cukup upload 1 file Excel saja**. Sistem akan otomatis memecah isi file ke tab WO 1, WO 2, WO 3, dan WO 4 di CRM berdasarkan **nama sheet** di dalam Excel.

---

## Cara Upload

1. Buka detail Work Order (klik nomor WO di halaman **Work Orders**).
2. Pilih tab **WO 1**, **WO 2**, **WO 3**, atau **WO 4** — boleh di mana saja.
3. Klik tombol **Import Master Excel**.
4. Pilih file Excel (`.xlsx`) yang sudah disiapkan.
5. Tunggu loading selesai — preview otomatis muncul di tiap tab.

---

## ⚠️ Aturan Penamaan Sheet di Excel (WAJIB)

Sistem hanya membaca sheet yang **namanya diawali** dengan `W1`, `W2`, `W3`, atau `W4`. Sheet dengan nama lain akan **diabaikan**.

| Tujuan WO | Nama Sheet (di tab bawah Excel) | Keterangan |
|---|---|---|
| **WO 1** | `W1.1`, `W1.2`, `W1.3`, … | Boleh banyak. Setiap sheet jadi spesifikasi terpisah di WO 1. |
| **WO 2** | `W2` | Hanya 1 sheet. Kalau ada lebih dari satu, yang dipakai cuma yang pertama. |
| **WO 3** | `W3` | Hanya 1 sheet. |
| **WO 4** | `W4` | Hanya 1 sheet. |

### Contoh struktur file Excel yang BENAR

```
[ W1.1 ] [ W1.2 ] [ W2 ] [ W3 ] [ W4 ]
```

(5 sheet tab di bawah Excel — boleh juga 6, 7, dst kalau WO 1 punya banyak varian.)

### Contoh yang SALAH

| Nama Sheet | Status | Alasan |
|---|---|---|
| `Sheet1`, `Sheet2`, `Data` | ❌ | Tidak diawali `W1`–`W4`, tidak ke-detect |
| `WO1.1`, `WO2`, `WO3` | ❌ | Harus `W1.1`, bukan `WO1.1` |
| `W1-1`, `W1_1` | ❌ | Harus pakai titik: `W1.1` |
| `w1.1` (huruf kecil) | ✅ | Huruf kecil OK (case-insensitive) |

---

## Tips Penting

1. **Cek nama sheet sebelum upload** — di Excel, klik kanan di tab sheet → **Rename**.
2. **Untuk WO 1** (yang ada gambar jersey, mock-up, dll):
   - Buat 1 sheet per varian/desain: `W1.1`, `W1.2`, `W1.3`, dst.
   - Tiap sheet harus berisi template lengkap (header AYRES APPAREL, kotak Desain Mock Up, Pattern, Customer info, dll).
3. **Maksimal ukuran file**: ~50 MB.
4. **Setelah upload berhasil**, ada tombol **Download All** untuk mengunduh kembali file Excel master yang barusan di-upload.
5. **Mau ganti / re-upload?** Klik **Delete All Import** dulu di tab WO 1, baru upload ulang.

---

## Penjelasan Tampilan Preview

| Tab | Engine Render | Catatan |
|---|---|---|
| **WO 1** | Microsoft Office Online (iframe embed) | Jersey design + semua image muncul persis seperti file Excel aslinya. |
| **WO 2 / WO 3 / WO 4** | Render HTML pakai SheetJS | Cell, border, dan teks ter-preserve. Untuk preview cepat. |

---

## FAQ

**Q: Kalau saya cuma punya data untuk WO 2 saja, perlu sheet W1, W3, W4 juga?**
A: Tidak. Sistem skip sheet yang tidak ada. Cukup buat sheet `W2` di Excel-nya.

**Q: Sheet di Excel-nya ada `Cover`, `Catatan`, dll — bahaya gak?**
A: Aman. Sheet yang tidak diawali `W1`–`W4` akan diabaikan, tidak masuk ke WO mana pun.

**Q: Kalau saya upload Master Excel baru, data sebelumnya hilang?**
A: Ya — semua data hasil import sebelumnya (WO 1–4 dari file lama) akan diganti dengan yang baru. Master Excel sebelumnya juga tertimpa.

**Q: Bisakah satu WO punya banyak Master Excel?**
A: Tidak. Satu WO = satu Master Excel. Kalau perlu update sebagian, upload ulang full master-nya.

**Q: Tampilan WO 1 di tab loading lama, gimana?**
A: Microsoft Office Online butuh beberapa detik untuk fetch file pertama kali. Refresh halaman kalau lebih dari 30 detik.
