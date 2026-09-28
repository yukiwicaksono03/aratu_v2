# Aratu Studio

Website editor foto dan PWA responsif, terinspirasi alur [Meitu](https://apps.apple.com/us/app/meitu-ai-photo-video-editor/id416048305). Identitas visual Aratu berdiri sendiri. Pengolahan foto berlangsung lokal di browser tanpa akun, API key, atau unggahan ke server.

## Jalankan

Memerlukan Node.js 20 atau lebih baru. Tidak perlu `npm install` karena tidak memakai dependensi eksternal.

```sh
npm run dev
```

Buka **http://localhost:5173**. Gunakan `PORT=3000 npm run dev` untuk port lain. Server pengembangan hanya mendengarkan pada loopback.

## Deploy ke Vercel

Repository ini menyertakan `vercel.json`. Vercel akan menjalankan `npm run build`, lalu menyajikan folder `dist/`. Setelah import repository, biarkan Framework Preset **Other** dan gunakan pengaturan berikut jika Vercel meminta konfigurasi manual:

- Build Command: `npm run build`
- Output Directory: `dist`
- Install Command: `npm install`

`server.mjs` hanya untuk server lokal; Vercel tidak perlu menjalankannya. Jika deployment lama masih menampilkan 404, lakukan redeploy dari commit yang berisi `vercel.json` dan pastikan **Root Directory** menunjuk ke folder repository yang berisi `package.json`.

```sh
npm test
npm run build
```

Build menghasilkan `dist/`. Unggah **seluruh isi** folder tersebut ke hosting statis yang menggunakan HTTPS. Dapat dipasang di root atau subfolder. Tidak membutuhkan backend, bundler, CDN, atau font eksternal.

Untuk memeriksa hasil build secara lokal:

```sh
SERVE_DIST=1 npm start
```

## Fitur yang tersedia

### UI editor

Mengikuti referensi screenshot Meitu: latar charcoal/hitam, aksen sian, kanvas di bagian atas, panel edit di bawah, dan bilah alat horizontal. Panel Retouch menjadi tampilan awal. Retouch serta penyesuaian warna menampilkan satu slider sesuai kontrol yang dipilih.

- **×** membatalkan perubahan sejak alat tersebut dibuka atau sejak penerapan terakhir.
- **✓** menerapkan perubahan dan menetapkan titik awal baru untuk pembatalan.
- **Reset** mengembalikan kontrol aktif ke nilai awal; pada teks/stiker, reset menghapus layer dari jenis tersebut.
- Berganti alat menerima perubahan alat sebelumnya. Undo/redo tetap tersedia di bawah kanvas.
- Tombol perluas kanvas menyembunyikan panel alat dan dapat ditekan kembali untuk kembali mengedit.
- Layout dibatasi ke lebar perangkat. Baris alat/filter bergulir di dalam panel, tombol buka foto menjadi ikon di ponsel, dan kanvas menyesuaikan ruang yang tersedia. Safe area ponsel diperhitungkan; layar mendatar pendek tetap dapat menggulir seluruh editor.

### Pengolahan foto

- Buka JPG, PNG, WebP, atau AVIF; drag-and-drop; foto contoh disertakan.
- 12 pilihan filter, kategori, dan intensitas yang dapat diatur.
- Flash terarah: kekuatan 0–100, luas cahaya, dan titik fokus yang dapat dipindahkan dengan mengetuk foto. Efek memperkirakan warna latar dari tepi gambar, melindungi bayangan gelap, dan mengurangi penguatan untuk foto yang sudah terang. Pengaturan ikut tersimpan dalam proyek serta ekspor.
- Eksposur, kontras, highlights, bayangan, saturasi, temperatur, tint, fade, grain, vignette.
- Auto enhance berdasarkan tingkat terang foto.
- Penghalusan berbasis warna kulit, pencerahan, dan kuas penghalus manual.
- Crop dengan rasio dan posisi, rotasi 90°, flip horizontal/vertikal.
- Teks beberapa baris, font, ukuran, warna, rotasi, bold, bayangan.
- 20 stiker; geser teks/stiker langsung di kanvas; navigasi layer dan tombol panah.
- Kuas dengan warna, ukuran, opasitas, dan riwayat sapuan.
- Bingkai klasik, Polaroid, serta warna dan ketebalan kustom.
- Kolase 2–4 foto dengan layout grid, editorial, atau photo strip.
- Undo/redo hingga 35 snapshot; perbandingan sebelum/sesudah.
- Autosave dan proyek bernama di IndexedDB, pemulihan setelah reload.
- Ekspor JPG, PNG, WebP dengan pengaturan kualitas dan resolusi, tanpa watermark.
- Manifest, ikon 192/512 px, service worker, dan petunjuk instalasi iOS/Android/desktop.

## Penggunaan PWA

1. Buka melalui HTTPS atau `localhost` dan tunggu status **Siap digunakan offline**.
2. Instal melalui menu browser atau tombol instal di bilah alat.
3. iOS: Safari → Bagikan → Tambahkan ke Layar Utama.
4. Editor dan foto contoh dapat digunakan offline setelah cache awal berhasil.

Instalasi dan offline memerlukan origin HTTP localhost atau HTTPS; membuka `index.html` langsung melalui `file://` tidak didukung. Update versi `CACHE` di `sw.js` saat merilis perubahan aset. Service worker baru mengambil alih setelah tab versi lama ditutup.

## Menggunakan Flash

1. Buka **Flash** di bilah alat bawah, lalu pilih **Flash** untuk mengaktifkan efek.
2. Atur **Kekuatan**; gunakan 80–100 sebagai titik awal untuk potret gelap dengan latar terang.
3. Ketuk subjek pada foto untuk mengarahkan cahaya. Atur **Area cahaya** untuk mempersempit atau memperluas efek.
4. Bandingkan sebelum/sesudah, lalu tekan centang untuk menerapkan. Penanda titik cahaya hanya muncul saat mengedit dan tidak ikut diekspor.

Preset **Flash** juga tersedia melalui Filter → Film; menggantikan efek CCD flash lama. Flash merupakan salah satu filter sehingga pemilihannya menggantikan preset filter aktif.

Efek ini adalah pendekatan pengolahan gambar lokal terhadap referensi before/after, bukan rekonstruksi pencahayaan 3D atau segmentasi AI. Bekerja paling baik pada potret gelap dengan warna latar yang berbeda dari subjek. Warna subjek/latar yang serupa, banyak orang, atau tepi gambar yang dipenuhi subjek dapat membuat penerangan tidak merata; sesuaikan titik, luas, dan kekuatannya.

## Batasan yang perlu diketahui

Ini **belum merupakan replika lengkap Meitu**. Belum tersedia deteksi landmark wajah, makeup/reshape, penghapus objek/latar otomatis, AI generatif/avatar/upscale, atau editor video. Penghalusan kulit menggunakan heuristik warna; warna latar yang mirip kulit bisa ikut terpengaruh. Filter thumbnail adalah pendekatan CSS, sedangkan kanvas dan hasil ekspor menggunakan pengolahan piksel yang sama.

- Unggahan maksimal 25 MB dan 40 megapiksel; sisi terpanjang diperkecil ke 4096 px untuk menjaga penggunaan memori. Ekspor tidak melakukan upscale.
- Maksimal 30 layer, 100 sapuan; pratinjau diproses hingga 1100 px agar tetap ringan. Retouch dan kolase besar dapat lebih lambat pada perangkat lama.
- Kolase dipotong dari tengah per sel dan menjadi satu gambar setelah dibuka di editor.
- Foto disimpan di browser/perangkat ini, tidak tersinkron. Menghapus data situs menghapus proyek. Unduh hasil untuk menyimpan salinan di luar browser.
- Ketika penyimpanan penuh atau tidak tersedia, editor tetap dapat bekerja dan mengekspor. Pergantian foto juga masuk riwayat Undo selama sesi masih terbuka.
- Tampilan emoji dan font sistem dapat berbeda antarperangkat.

## Struktur

```text
index.html             Shell HTML
src/app.js             Interaksi, panel, proyek, kolase, ekspor
src/core.js            Filter piksel, crop, smoothing, history
src/renderer.js        Transformasi canvas, layer, sapuan, komposisi
src/storage.js         IndexedDB
src/icons.js           Ikon SVG lokal
src/styles.css         Desktop dan mobile
public/                Ikon PWA dan foto contoh
sw.js                  Cache dan fallback offline
manifest.webmanifest   Metadata instalasi
server.mjs             Server lokal tanpa dependensi
scripts/build.mjs      Build statis
tests/                 Pengujian inti dan kontrak cache PWA
```

## Verifikasi

Pengujian Node mencakup crop, intensitas filter, mono, eksposur, transparansi, noise deterministik, blur, history, precache aset, fallback offline, update cache, serta dimensi ikon manifest. Pengujian service worker menggunakan simulasi API, bukan instalasi browser sungguhan.

Pada lingkungan pembuatan ini, server lokal diblokir sandbox (`listen EPERM`) dan navigasi pratinjau `file://` ditolak kebijakan keamanan browser. Karena itu interaksi browser, tata letak responsif, unduhan, dan instalasi/offline pada perangkat nyata **belum diverifikasi secara end-to-end**.

## Aset contoh

Foto `public/assets/portrait.jpg` dibuat dengan imagegen bawaan lalu dikonversi ke JPEG. Prompt lengkap dan asal aset ada di [ASSETS.md](ASSETS.md).
# aratu_v2
