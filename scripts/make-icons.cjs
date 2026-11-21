// Renders the app icons from a hand-written SVG: a red handheld card-dex (big blue lens, three lights, a
// stepped lid line and a screen showing a card). Plain geometry, no external artwork.
//
// Usage: node scripts/make-icons.cjs <out-dir>     (then copy the PNGs into assets/)
const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');

const OUT = process.argv[2] ?? path.join(__dirname, '..', 'assets');
const BG = '#7d0c18';
const SPLASH_BG = '#0d0d12';
const RED = '#e3283b';
const RED_DARK = '#a3101f';
const LINE = '#5e0812';
const CREAM = '#fff4ec';
const LENS = ['#bfeaff', '#2f9ee8', '#0e4f9c'];
const SCREEN = '#16303c';
const CARD = '#7ff0d8';

// In a 100 x 100 box.
function glyph(uid, mono) {
  const c = (color) => (mono ? '#ffffff' : color);
  if (mono) {
    return `
  <defs>
    <mask id='m${uid}'>
      <rect x='12' y='8' width='76' height='84' rx='12' fill='white'/>
      <circle cx='32' cy='28' r='13' fill='black'/>
      <path d='M12 48 H40 L50 39 H88' stroke='black' stroke-width='4' fill='none'/>
      <rect x='22' y='56' width='56' height='28' rx='5' fill='black'/>
    </mask>
  </defs>
  <rect x='12' y='8' width='76' height='84' rx='12' fill='white' mask='url(#m${uid})'/>
  <circle cx='32' cy='28' r='8.5' fill='white'/>
  <circle cx='58' cy='20' r='4' fill='white'/>
  <circle cx='69' cy='20' r='4' fill='white'/>
  <circle cx='80' cy='20' r='4' fill='white'/>
  <rect x='43' y='61' width='14' height='19' rx='2.5' fill='white'/>`;
  }
  return `
  <defs>
    <radialGradient id='lens${uid}' cx='0.38' cy='0.35' r='0.7'>
      <stop offset='0' stop-color='${LENS[0]}'/>
      <stop offset='0.45' stop-color='${LENS[1]}'/>
      <stop offset='1' stop-color='${LENS[2]}'/>
    </radialGradient>
    <linearGradient id='body${uid}' x1='0' y1='0' x2='0' y2='1'>
      <stop offset='0' stop-color='${RED}'/>
      <stop offset='1' stop-color='${RED_DARK}'/>
    </linearGradient>
  </defs>
  <rect x='12' y='8' width='76' height='84' rx='12' fill='url(#body${uid})' stroke='${LINE}' stroke-width='2.5'/>
  <path d='M12 48 H40 L50 39 H88' stroke='${LINE}' stroke-width='3' fill='none' stroke-linejoin='round'/>
  <circle cx='32' cy='28' r='13' fill='${CREAM}' stroke='${LINE}' stroke-width='2'/>
  <circle cx='32' cy='28' r='9.5' fill='url(#lens${uid})'/>
  <ellipse cx='28.5' cy='24.5' rx='3' ry='2' fill='#ffffff' opacity='0.85'/>
  <circle cx='58' cy='20' r='4' fill='#ff6b6b' stroke='${LINE}' stroke-width='1.5'/>
  <circle cx='69' cy='20' r='4' fill='#ffd84a' stroke='${LINE}' stroke-width='1.5'/>
  <circle cx='80' cy='20' r='4' fill='#4ad66d' stroke='${LINE}' stroke-width='1.5'/>
  <rect x='20' y='54' width='60' height='32' rx='6' fill='${CREAM}' stroke='${LINE}' stroke-width='2'/>
  <rect x='25' y='58.5' width='50' height='23' rx='3' fill='${SCREEN}'/>
  <rect x='43.5' y='61' width='13' height='18' rx='2' fill='none' stroke='${c(CARD)}' stroke-width='2'/>
  <path d='M50 65.5 Q50.7 69.3 54 70 Q50.7 70.7 50 74.5 Q49.3 70.7 46 70 Q49.3 69.3 50 65.5 Z' fill='${CARD}'/>`;
}

let n = 0;
function svg({ size, scale, background, mono = false }) {
  const s = (size * scale) / 100;
  const off = (size - size * scale) / 2;
  return `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 ${size} ${size}'>
  ${background ? `<rect width='${size}' height='${size}' fill='${background}'/>` : ''}
  <g transform='translate(${off} ${off}) scale(${s})'>${scale > 0 ? glyph(n++, mono) : ''}</g>
</svg>`;
}

function render(name, opts) {
  const png = new Resvg(svg(opts), { fitTo: { mode: 'original' } }).render().asPng();
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, name), png);
  console.log(`${name}  ${opts.size}x${opts.size}`);
}

render('icon.png', { size: 1024, scale: 0.8, background: BG });
// Adaptive icon (Android 8+): the foreground stays inside the ~61% safe zone so masks never clip it.
render('android-icon-foreground.png', { size: 512, scale: 0.6, background: null });
render('android-icon-background.png', { size: 512, scale: 0, background: BG });
render('android-icon-monochrome.png', { size: 432, scale: 0.6, background: null, mono: true });
render('favicon.png', { size: 48, scale: 0.92, background: BG });
render('splash-icon.png', { size: 512, scale: 0.7, background: null });
render('preview-dark.png', { size: 256, scale: 0.7, background: SPLASH_BG });
