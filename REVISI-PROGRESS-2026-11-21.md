# Revisi AYRES CRM — 21 Nov 2026

Audit + progress revisi batch dari Arya/CS. Dibaca atas→bawah. Status tiap item:
⬜ belum · 🔄 dikerjakan · ✅ selesai · ❓ perlu konfirmasi · ℹ️ bukan bug (penjelasan).

Prinsip: **audit dulu, baru revisi, jangan sampai ada bug.** Tiap perubahan di-build (`npm run build` hijau) sebelum commit.

---

## A. Dashboard (gambar: KPI utama)

| ID | Permintaan | Status | Catatan audit |
|----|------------|--------|----------------|
| A1 | Tambah **jumlah order pcs yang masuk** di kartu KPI | ⬜ | Dashboard sekarang punya: Total Pendapatan, Customer Orders (count), Pending Orders, WO Aktif, WO Terlambat. Belum ada **total qty (pcs)**. Qty harus **exclude aksesoris** (pakai `lib/qty-aksesoris`) biar konsisten dgn Grafik Analisa. |
| A2 | Analisa **% per paket** + **% demografi per kabupaten** | ⬜ | Data ada: `order_items` (paket+qty) & `orders.customer_kabupaten`. Dibuat section baru di Dashboard: tabel paket (qty + %), tabel kabupaten (customer/qty + %). |

## B. Grafik Analisa (menu Analisa → Grafik)

| ID | Permintaan | Status | Catatan audit |
|----|------------|--------|----------------|
| B1 | Tombol **pilih Bulan** (1 klik = rentang 1 bulan) | ⬜ | Sekarang harus set tanggal Dari & Sampai manual. Tambah dropdown Bulan+Tahun → auto isi rentang awal–akhir bulan. |
| B2 | Total Qty 4.316 — Nov cuma 2.600an? | ℹ️ | **Bukan bug.** 4.316 = rentang **23 Okt–21 Nov** (30 hari), dan **sudah** exclude aksesoris. Kalau mau Nov saja, pilih rentang 1–21 Nov (atau pakai tombol Bulan setelah B1). Angka bisa dicek ulang setelah B1 jalan. |
| B3 | Grafik paket → **TABEL**: jumlah order/paket, %, **nominal/paket** | ⬜ | Qty & order_count per paket sudah ada di API. **Nominal per paket** perlu dihitung dari `order_items.qty × order_items.harga` (harga keisi dari Rincian Order; sebagian order lama mungkin harga 0 → nominal paket bisa understated). Dicatat di tabel + % kontribusi qty. |
| B4 | **Provinsi → Kabupaten** | ⬜ | Betul: `customer_provinsi` sering kosong, `customer_kabupaten` lebih lengkap & relevan utk rencana cabang. Ganti agregasi provinsi → kabupaten (`COALESCE(NULLIF(TRIM(customer_kabupaten),''),'(Tanpa Kabupaten)')`). |
| B5 | **Semua menu grafik → tabel data saja** | ⬜ | Terdampak: Grafik, Grafik CS, Grafik Leads, Grafik Reseller. Chart diganti tabel (grafik dihapus, tabel saja). |

## C. Grafik CS (menu Analisa → Grafik CS)

| ID | Permintaan | Status | Catatan audit |
|----|------------|--------|----------------|
| C1 | Total Qty beda dgn menu Grafik | 🔎 bug | **Penyebab:** (1) Grafik CS **TIDAK** mengecualikan aksesoris (`/api/analisa/grafik-cs` tidak join `barang_cs`), sedangkan Grafik Analisa mengecualikan. (2) Rentang beda (Grafik CS 1–21 Nov vs Grafik 23 Okt–21 Nov). Fix: samakan — exclude aksesoris. |
| C2 | **KERAH KOMBINASI tidak boleh muncul** (hanya paket yg dijual) | 🔎 bug | KERAH KOMBINASI = aksesoris (`barang_cs.hitung_qty=0`). Fix sama dgn C1: exclude aksesoris di paket, matrix (paket×leads), dan agregasi leads/total. |

## D. Reseller (menu Reseller → Order per Reseller)

| ID | Permintaan | Status | Catatan audit |
|----|------------|--------|----------------|
| D1 | Reseller 0 order — bener kosong? | ❓ | `/api/reseller/order-breakdown` hanya hitung order yg **`reseller_nama`-nya keisi**, yaitu order yg **saat dibuat CS memilih reseller** dari dropdown (Buat Order / CS Selling). 0 = tidak ada order ber-tag reseller di 1–21 Nov. **Kemungkinan besar bukan bug kode, tapi proses input** (CS tidak memilih reseller). Perlu konfirmasi cara menandai order reseller. |

## E. Restrukturisasi Menu (gambar sidebar)

Permintaan: urutan menu baru + gabung beberapa menu + menu baru kosong.

**Urutan target:** 1) Dashboard, 2) Merchandiser, 3) PPIC, 4) Admin PPIC (sub: Checklist Progress, Data Waste Proses), 5) Work Order, 6) Gudang, 7) Quality Assurance, 8) Produksi, 9) Progress Produksi, 10) Finance, 11) Setting, 12) Master, 13) Analisa, 14) Reseller.

| ID | Permintaan | Status | Catatan audit |
|----|------------|--------|----------------|
| E1 | CS Selling, Antrian Design, CS Order → **sub-menu Merchandiser** | ❓ | Nav sekarang **cuma 1 tingkat** (menu → halaman). 3 menu itu masing-masing punya banyak halaman. Jadi sub-menu Merchandiser butuh keputusan: **(a) flatten** (semua halaman jadi daftar rata di bawah Merchandiser) atau **(b) nav 2-tingkat** (grup di dalam Merchandiser — perlu ubah komponen nav + hak akses). |
| E2 | Hapus **Admin Produksi**, ganti **PPIC** (kosong dulu) | ⬜ | Hapus grup "Admin Produksi" dari sidebar + `MENU_HREF_MAP`. Tambah "PPIC" (placeholder kosong). Catatan: halaman lama (Monitoring Produksi, Papan Finishing, dll) tidak dihapus — cuma hilang dari menu (perlu konfirmasi apakah dipindah ke PPIC/QA atau benar-benar disembunyikan). |
| E3 | **Admin PPIC** + sub: Checklist Progress, Data Waste Proses | ⬜ | Halaman baru (belum ada). Dibuat **placeholder kosong** dulu. |
| E4 | **Quality Assurance** (menu baru) | ⬜ | Placeholder kosong dulu. |
| E5 | Urutan menu sesuai list | ⬜ | Susun ulang `ADMIN_NAV`. Perlu sinkron dgn hak akses role (`MENU_HREF_MAP`, `role_menu_access`) biar role non-admin tidak jebol/hilang akses. |

---

## Yang sudah selesai sebelumnya (konteks)
- ✅ Fix nama order "berubah sendiri" / ketukar (Rincian Order tidak lagi menimpa identitas customer dari draft) — commit `5e6e698`. Data lama (mis. ORD1798) tetap perlu dibetulkan manual.

## Perlu konfirmasi sebelum lanjut
1. **E1 — cara gabung menu** ke Merchandiser: flatten atau grup 2-tingkat?
2. **E2 — halaman "Admin Produksi" lama** (Monitoring, Papan Finishing, Laporan Produksi, Penggunaan Bahan): dipindah ke PPIC/QA, atau disembunyikan dulu?
3. **D1 — reseller**: order reseller ditandai gimana? (CS pilih reseller saat buat order, atau otomatis dari customer yg terdaftar sbg reseller?)

## Urutan pengerjaan (rencana)
1. **C1+C2** (bug Grafik CS exclude aksesoris) — paling jelas, aman.
2. **B4** (provinsi→kabupaten).
3. **B5** (grafik→tabel) + **B3** (tabel paket + nominal) + **B1** (tombol bulan) — satu paket halaman Analisa.
4. **A1+A2** (dashboard pcs + analisa %).
5. **E** (restrukturisasi menu) — setelah konfirmasi #1 & #2.
6. **D1** — setelah konfirmasi #3.
