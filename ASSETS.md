# Aset Aratu Studio

## Foto contoh

- File: `public/assets/portrait.jpg` (1024 × 1536).
- Dibuat menggunakan tool **imagegen bawaan**, bukan CLI/API.
- Dipakai sebagai foto demonstrasi editor dan thumbnail filter. Foto pengguna diproses lokal; aplikasi tidak memanggil imagegen saat digunakan.
- Hasil PNG diperiksa lalu dikonversi menjadi JPEG kualitas 88 menggunakan `sips`.

Prompt lengkap:

> Use case: photorealistic-natural. Asset type: bundled demo portrait for a browser photo editor. Primary request: editorial lifestyle portrait of an adult Indonesian woman, shoulder-length dark hair, wearing an ivory linen blouse, standing in a sunlit garden with blurred olive green leaves and small cream flowers. Relaxed natural expression, looking at camera, real visible skin texture. Composition: portrait 2:3, head and upper body centered with space around head. Lighting: soft warm afternoon daylight, neutral colors suitable for demonstrating photo filters and retouch. No text, logos, watermarks or graphic overlays.

## Ikon dan font

- Ikon UI: SVG lokal di `src/icons.js`.
- Ikon aplikasi: `public/icon.svg`, `public/icon-192.png`, `public/icon-512.png`.
- Font menggunakan font sistem; tidak ada permintaan Google Fonts/CDN.
- Stiker menggunakan simbol Unicode/emoji dari sistem operasi.

## Referensi produk

[Meitu AI Photo & Video Editor, App Store](https://apps.apple.com/us/app/meitu-ai-photo-video-editor/id416048305) digunakan sebagai referensi kategori fitur. Logo, aset promosi, dan kode Meitu tidak dipakai dalam aplikasi.
