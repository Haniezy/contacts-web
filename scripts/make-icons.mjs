// Builds the app icons in public/icons from the book logo:
//   node scripts/make-icons.mjs
// "any" icons have rounded corners; the maskable one fills the square and
// keeps the book inside the 80% safe zone, since Android crops it.
import sharp from 'sharp';

const book = (scale, offset) =>
  `<g transform="translate(${offset} ${offset}) scale(${scale})" fill="none" stroke="#3e9c7c" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 20V5a2 2 0 0 1 2-2h13v17H7a2 2 0 0 0-2 2"/><path d="M9 7h7M9 11h5"/></g>`;
const svg = (radius, scale, offset) =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e3f7ef"/><stop offset="1" stop-color="#c9ede0"/></linearGradient></defs>
  <rect width="512" height="512" rx="${radius}" fill="url(#bg)"/>${book(scale, offset)}</svg>`);

const any = svg(112, 11.67, 116);
const full = svg(0, 11.67, 116);
const maskable = svg(0, 9.33, 144);
const out = 'public/icons';
await sharp(any).resize(192).png().toFile(`${out}/icon-192.png`);
await sharp(any).resize(512).png().toFile(`${out}/icon-512.png`);
await sharp(maskable).resize(512).png().toFile(`${out}/maskable-512.png`);
// iOS rounds the corners itself and shows transparency as black.
await sharp(full).resize(180).png().toFile(`${out}/apple-touch-icon.png`);
console.log('icons written');
