# Pengujian Metode Pengiriman Pengingat

Dokumen ini berisi panduan untuk menguji kedua metode pengiriman pengingat di aplikasi antrean BPS Bulungan.

## 1. Pengujian WhatsApp Direct

WhatsApp Direct adalah metode termudah karena hanya membuka link WhatsApp dengan pesan yang sudah disiapkan.

### Langkah Pengujian:

1. Login ke aplikasi sebagai admin
2. Pilih antrian yang belum mengisi SKD
3. Klik "Kirim Pengingat"
4. Isi pesan pengingat atau gunakan pesan default
5. Klik tombol "Kirim via WA Direct"
6. Tab baru akan terbuka dengan WhatsApp Web atau aplikasi WhatsApp akan terbuka
7. Klik "Send" pada aplikasi WhatsApp untuk mengirim pesan

### Troubleshooting:

- Jika WhatsApp tidak terbuka, pastikan browser mengizinkan pop-up
- Jika nomor tidak ditemukan, periksa apakah format nomor sudah benar (awalan 62)

## 2. Pengujian WhatsApp Bot

WhatsApp Bot mengirim pesan secara otomatis melalui API WhatsApp.

### Langkah Pengujian:

1. Login ke aplikasi sebagai admin
2. Pastikan WhatsApp Bot API sudah dikonfigurasi di `.env`
3. Pilih antrian yang belum mengisi SKD
4. Klik "Kirim Pengingat"
5. Isi pesan pengingat atau gunakan pesan default
6. Klik tombol "Kirim via WA Bot"
7. Tunggu hingga proses pengiriman selesai
8. Periksa ponsel penerima untuk memastikan pesan diterima

### Troubleshooting:

- Jika terjadi error "Nomor tidak terdaftar di WhatsApp", pastikan nomor tujuan sudah terdaftar di WhatsApp
- Jika terjadi error "Gagal mendapatkan token", periksa konfigurasi WhatsApp API di `.env`
- Periksa log server untuk informasi error yang lebih detail

## Contoh Kasus Pengujian

Berikut adalah beberapa skenario yang dapat digunakan untuk menguji fungsionalitas pengiriman pengingat:

### Kasus 1: Nomor Valid dengan WhatsApp

1. Tambahkan antrian dengan nomor telepon yang memiliki WhatsApp
2. Uji pengiriman melalui WhatsApp Direct
3. Uji pengiriman melalui WhatsApp Bot
4. Verifikasi pesan diterima di kedua metode

### Kasus 2: Nomor Valid tanpa WhatsApp

1. Tambahkan antrian dengan nomor telepon yang tidak memiliki WhatsApp
2. Uji pengiriman melalui WhatsApp Direct (seharusnya gagal/tidak ditemukan)
3. Uji pengiriman melalui WhatsApp Bot (seharusnya menampilkan pesan "Nomor tidak terdaftar di WhatsApp")

### Kasus 3: Format Nomor Berbeda

1. Tambahkan antrian dengan nomor telepon dalam format berbeda (misalnya awalan 0, +62, atau tanpa awalan)
2. Uji semua metode pengiriman
3. Verifikasi sistem mampu menormalkan format nomor sebelum mengirim

### Kasus 4: Gangguan Koneksi

1. Matikan server WhatsApp Bot API
2. Uji pengiriman via WhatsApp Bot
3. Verifikasi pesan error yang ditampilkan
4. Nyalakan kembali server dan uji ulang untuk memastikan berfungsi normal
