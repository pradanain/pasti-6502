# Sistem Antrean PST BPS Bulungan

Aplikasi antrean digital untuk Pelayanan Statistik Terpadu (PST) BPS Kabupaten Bulungan. Fokusnya: antrean online/offline, buku tamu, tampilan layar antrean, dashboard petugas, analitik, plus opsi notifikasi via WhatsApp Bot.

## Daftar Isi
- [Apa dan Kenapa](#apa-dan-kenapa)
- [Fitur Utama](#fitur-utama)
- [Tech Stack](#tech-stack)
- [Struktur Data Singkat](#struktur-data-singkat)
- [Prasyarat](#prasyarat)
- [Variabel Lingkungan](#variabel-lingkungan)
- [Setup Cepat (Development)](#setup-cepat-development)
- [Jalankan via Docker Compose](#jalankan-via-docker-compose)
- [Skrip Penting](#skrip-penting)
- [Alur Penggunaan](#alur-penggunaan)
- [Ringkasan Endpoint](#ringkasan-endpoint)
- [Catatan Produksi](#catatan-produksi)
- [Kontribusi](#kontribusi)

## Apa dan Kenapa
Butuh antrean yang rapi tanpa ribet: pengunjung bisa daftar lewat QR atau walk-in, petugas memantau dari dashboard, layar TV menampilkan antrean yang aktif, dan semua data tercatat untuk analitik. Integrasi WA Bot opsional kalau mau kirim pengingat otomatis.

## Fitur Utama
- Login cepat (username/password) dan role `SUPERADMIN`/`ADMIN`.
- Dashboard ringkasan: antrean hari ini, rata-rata waktu tunggu/layanan, shortcut konfigurasi.
- Manajemen antrean: mulai, selesaikan, batalkan, dan kirim pengingat SKD via WhatsApp.
- Riwayat lengkap: semua antrean dengan filter status.
- Analytics: tren harian, distribusi layanan, online vs offline, performa admin, ekspor CSV/JSON.
- Layanan: tambah/aktif/nonaktif/hapus.
- Pengguna (Superadmin): tambah/ubah/hapus admin.
- QR Code: unduh QR statis untuk mengarahkan ke formulir pengunjung.
- Display antrean publik: lihat antrean yang sedang dilayani dan antrean berikutnya (bisa difilter petugas/tanggal).
- Form pengunjung online (via QR) dengan UUID dinamis dan tracking status.
- Buku tamu/walk-in: isi biodata lengkap, antrean offline otomatis sesuai keperluan.
- Notifikasi: antrean baru, mulai/selesai/batal, pengingat SKD, penanda SKD terisi.
- Tema terang/gelap untuk halaman publik dan dashboard.

## Tech Stack
- Next.js 15 (App Router), React 19, TypeScript
- Tailwind CSS 4, Radix UI, shadcn components, lucide-react
- Prisma ORM + PostgreSQL
- NextAuth (credentials, JWT)
- Bun runtime & bunx
- Recharts, date-fns, zod, bcryptjs, nodemailer, qrcode, html-pdf

## Struktur Data Singkat
- **User**: kredensial, nama, role (`SUPERADMIN`/`ADMIN`).
- **Service**: jenis layanan PST, status aktif/inaktif.
- **Visitor / Guest**: data pengunjung dan detail buku tamu (gender, pendidikan, pekerjaan, tujuan).
- **Queue**: nomor harian, status (`WAITING`, `SERVING`, `COMPLETED`, `CANCELED`), tipe (`ONLINE`/`OFFLINE`), relasi ke visitor/guest/service/admin, waktu mulai/selesai, flag SKD.
- **QRCode & TempVisitorLink**: UUID statis untuk QR, UUID dinamis (berlaku 1 jam) untuk form online.
- **Notification**: log sistem dan status dibaca.

## Prasyarat
- Bun 1.1.x atau Node.js 18+ (disarankan Bun seperti di Dockerfile)
- PostgreSQL 15+ (atau lewat docker compose)
- Git, Docker, dan docker compose (jika pakai kontainer)

## Variabel Lingkungan
Buat file `.env` di root. Pakai nilai aman sendiri (jangan pakai contoh produksi).

```
DATABASE_URL="postgresql://USER:PASSWORD@pasti_db:5432/pasti_db"
NEXTAUTH_SECRET="ganti_dengan_string_acak"
NEXTAUTH_URL="http://localhost:3000"
NEXT_PUBLIC_STATIC_UUID="uuid_statis_qr"          # Disimpan di tabel QRCode & public/qrcodes
NEXT_PUBLIC_WA_API_URL="https://example.com/wa-api"  # Opsional: endpoint WA Bot
NEXT_PUBLIC_QR_BASE_URL="https://domain-produksi"    # Opsional: paksa base URL untuk QR di dashboard
WA_ADMIN_KEY="server_only_admin_key"                 # Opsional: kunci WA Bot, jangan dipublish
# Opsi seed dev (hanya dipakai saat NODE_ENV!=production)
# SEED_ADMIN_USERNAME="admin"
# SEED_ADMIN_PASSWORD="password_dev_superaman"
# SEED_OPERATOR_USERNAME="petugas"
# SEED_OPERATOR_PASSWORD="password_dev_superaman"
```

Penjelasan cepat:
- `NEXT_PUBLIC_STATIC_UUID`: UUID yang ditanam di QR statis; seed membuat `public/qrcodes/pst-qrcode.png` yang mengarah ke `/visitor-form/<UUID>`.
- `NEXTAUTH_URL`: base URL publik yang dipakai saat seed untuk membentuk link QR.
- `NEXT_PUBLIC_QR_BASE_URL`: opsional, paksa base URL saat render QR di dashboard (default pakai domain origin halaman).
- `NEXTAUTH_*`: wajib untuk NextAuth JWT.
- Variabel WA opsional; tanpa itu, fitur pengingat WA Bot akan dilewati. `WA_ADMIN_KEY` hanya boleh hidup di server/env, bukan diawali `NEXT_PUBLIC`.
- Variabel `SEED_*` hanya untuk development; jika tidak diset, seed akan membuat password acak dan mencetaknya di log.

## Setup Cepat (Development)
1. Clone repo  
   `git clone <url-repo> && cd sistem-antrean-pst`
2. Instal dependensi  
   `bun install`
3. Siapkan `.env` sesuai contoh di atas.
4. Migrasi dan generate Prisma  
   ```
   bunx prisma migrate dev --name init
   bunx prisma generate
   ```
5. Seed data awal (akun, layanan, QR) — hanya untuk development (akan gagal jika `NODE_ENV=production`)  
   ```
   bun run db:seed
   ```
   Password seed bisa diatur via `SEED_ADMIN_PASSWORD` dan `SEED_OPERATOR_PASSWORD` (server-only). Jika dikosongkan, script membuat password acak dan menampilkannya di log.
6. Jalankan dev server  
   `bun run dev`  
   Akses di `http://localhost:3000`.

## Jalankan via Docker Compose
1. Pastikan `.env` sudah terisi.
2. Build dan jalan: `docker compose up -d --build`  
   - Aplikasi: port host 3001 -> container 3000.  
   - Database: service `pasti_db` (user/pass/db default ada di `docker-compose.yml`; kalau jalankan Prisma di host, map-kan port 5432 atau ubah host ke `localhost`).
3. Migrasi (wajib) dan seed dev (opsional, jangan dijalankan di produksi):  
   ```
   docker compose exec pasti bunx prisma migrate deploy
   # seed hanya saat environment development:
   docker compose exec pasti bun run db:seed
   ```
4. Opsional: aktifkan service WA Bot dengan membuka komentar `wa-bot` dan set `ADMIN_KEY`.

## Skrip Penting
- `bun run dev` - jalan Next.js (Turbopack).
- `bun run build` / `bun run start` - build dan start production.
- `bun run lint` - linting.
- `bun run db:generate` - generate Prisma client.
- `bun run db:migrate` - deploy migrasi.
- `bun run db:reset` - reset database (hanya untuk dev).
- `bun run db:seed` - isi data awal (user, layanan, QR).
- `bun run db:studio` - buka Prisma Studio.

## Alur Penggunaan
- **Pengunjung online**: scan QR statis -> backend keluarkan UUID dinamis (1 jam) -> isi form `/visitor-form/<uuid>` -> antrean bernomor harian dibuat -> bisa lacak status via link tracking -> petugas bisa kirim pengingat SKD.
- **Walk-in/Buku tamu**: buka `/guest` (bisa via QR publik) -> isi biodata dan tujuan -> sistem pilih layanan aktif dan buat antrean offline otomatis.
- **Petugas/Admin**: login -> pantau dashboard -> mulai/selesaikan/batalkan antrean -> kirim pengingat SKD -> baca notifikasi -> kelola layanan (Superadmin juga kelola user).
- **Display publik**: buka `/queue-display` di layar TV; bisa filter petugas atau tampilkan semua, auto refresh.
- **Analitik & ekspor**: buka halaman Analytics untuk lihat tren dan unduh CSV/JSON lewat endpoint ekspor.

## Ringkasan Endpoint
Semua diawali `/api`. (Auth) butuh sesi NextAuth, (Superadmin) butuh role `SUPERADMIN`.

- **Auth & Health**  
  - `POST /api/auth/[...nextauth]` (login credentials) (Auth)  
  - `GET /api/health` (cek API/DB/WA)
- **Dashboard & Analytics (Auth)**  
  - `GET /api/dashboard/stats?hash=` (statistik harian, hash untuk polling)  
  - `GET /api/analytics?startDate=YYYY-MM-DD` (ringkasan + tren)  
  - `GET /api/analytics/export?startDate=&format=csv|json` (ekspor antrean)
- **Antrean (Auth, kecuali detail)**  
  - `GET /api/queue?status=&dateFilter=today|all&hash=` (daftar antrean)  
  - `GET /api/queue/all?hash=` (semua antrean)  
  - `GET /api/queue/{id}` (detail antrean, publik)  
  - `POST /api/queue/{id}/serve` (set SERVING)  
  - `POST /api/queue/{id}/complete` (set COMPLETED, superadmin bisa menutup antrean siapa saja)  
  - `POST /api/queue/{id}/cancel` (batalkan WAITING/SERVING, aturan peran sama)  
  - `POST /api/queue/{id}/remind-skd` (siapkan link wa.me, log notifikasi)
- **Display antrean (publik)**  
  - `GET /api/queue-display?adminId=all|<id>&dateFilter=today|all` (serving + next queue, dukung hash)  
  - `GET /api/queue-display/admins` (daftar admin/superadmin)
- **Form pengunjung online**  
  - `GET /api/visitor-form/{staticUuid}` (validasi QR statis, balikan UUID dinamis 1 jam)  
  - `GET /api/visitor-form/services` (header `x-visitor-uuid`) (cek layanan aktif)  
  - `POST /api/visitor-form/submit` (buat antrean online; body: name, phone, institution?, email?, serviceId, tempUuid, queueType)  
  - `GET /api/visitor-form/track` (headers `x-visitor-uuid`, `x-queue-hash?`) (lacak status + estimasi tunggu)  
  - `POST /api/visitor-form/skd` (set status SKD terisi)
- **Buku tamu / walk-in**  
  - `POST /api/guest` (simpan biodata, buat antrean offline otomatis)
- **Layanan (Auth)**  
  - `GET /api/services?status=ACTIVE|INACTIVE`  
  - `POST /api/services`  
  - `GET /api/services/{id}`  
  - `PATCH /api/services/{id}`  
  - `DELETE /api/services/{id}`
- **Pengguna (Superadmin)**  
  - `GET /api/users`  
  - `POST /api/users` (default role ADMIN)  
  - `PATCH /api/users/{id}` (tidak bisa ubah superadmin)  
  - `DELETE /api/users/{id}` (kecuali superadmin)
- **Notifikasi (Auth)**  
  - `GET /api/notifications?hash=` (ambil yang belum dibaca)  
  - `POST /api/notifications` (tandai semua sudah dibaca)  
  - `POST /api/notifications/{id}` (tandai satu notifikasi)

Header khusus yang dipakai di beberapa endpoint:
- `x-visitor-uuid` untuk validasi UUID dinamis/form tracking.
- `x-queue-hash` untuk polling efisien (hanya kirim data jika berubah).

## Catatan Produksi
- Seed dinonaktifkan saat `NODE_ENV=production`; pastikan tidak menjalankannya di lingkungan produksi.
- Ganti semua kredensial hasil seed (atau set sendiri via `SEED_*` saat dev).
- Pastikan `NEXTAUTH_SECRET` dan `NEXT_PUBLIC_STATIC_UUID` unik dan aman.
- Atur HTTPS/reverse proxy untuk `NEXTAUTH_URL`.
- Jika pakai WA Bot, jalankan service bot (contoh: `bot-wa-pst`) dan set `NEXT_PUBLIC_WA_API_URL` serta `WA_ADMIN_KEY` (server-only, jangan dipublish) dengan benar.

## Kontribusi
Silakan buka issue atau pull request untuk perbaikan. Hindari commit nilai rahasia `.env`.
