import { NitroModules } from 'react-native-nitro-modules';
import { closestName } from './catalog';
import type { Text, TextRecognizer } from 'react-native-vision-camera-ocr-plus';

export interface CardGuess {
  name: string | null;
  setCode: string | null;
  total?: number | null;
  lang?: string | null;
  collectorNumber: string | null;
  foil: boolean;
  rawText: string;
  turns?: number;
  nameBox?: { x: number; y: number; h: number };
}

let recognizer: TextRecognizer | null = null;
function getRecognizer(): TextRecognizer {
  if (!recognizer) recognizer = NitroModules.createHybridObject<TextRecognizer>('TextRecognizer');
  return recognizer;
}

export async function recognizeText(photoUri: string): Promise<Text> {
  const uri = /^[a-z][a-z0-9+.-]*:\/\//i.test(photoUri) ? photoUri : `file://${photoUri}`;
  return (await getRecognizer().recognizePhoto(uri, 'portrait')) as Text;
}

export async function recognizeCard(photoUri: string): Promise<CardGuess> {
  return parseCardText(await recognizeText(photoUri));
}

interface Line {
  text: string;
  x: number;
  y: number;
  h: number;
}

const NUMBER = /(?:^|[^A-Za-z0-9])([A-Z]{0,3}[0-9OIl]{1,3})\s*\/\s*([A-Z]{0,3}[0-9OIl]{2,3})(?![0-9])/;
const PRINTED_CODE = /\b([A-Z0-9]{3})(?:\s+|\s*·\s*)EN\b/;
const NOT_NAME =
  /^(stage|basic\b|evolves|put |hp\b|level|lv\.?\b|mega evolution|trainer|item\b|supporter|stadium|pok[eé]mon tool|special energy|basic energy|ability|pok[eé]-power|pok[eé]-body|restored|tera\b|v-union|break\b|prism star)/i;
function digits(token: string): string {
  return token.replace(/[Oo]/g, '0').replace(/[Il]/g, '1');
}

type RawLine = Text['blocks'][number]['lines'][number];

export function textTurns(raw: RawLine[]): number {
  let sx = 0;
  let sy = 0;
  for (const l of raw) {
    const p = l.lineCornerPoints;
    if (!p || p.length < 2 || l.lineText.trim().length < 4) continue;
    sx += p[1].x - p[0].x;
    sy += p[1].y - p[0].y;
  }
  if (sx === 0 && sy === 0) return 0;
  return (((Math.round(Math.atan2(sy, sx) / (Math.PI / 2)) % 4) + 4) % 4) as 0 | 1 | 2 | 3;
}

function unrotate(x: number, y: number, turns: number): [number, number] {
  switch (turns) {
    case 1:
      return [y, -x];
    case 2:
      return [-x, -y];
    case 3:
      return [-y, x];
    default:
      return [x, y];
  }
}

function uprightLines(raw: RawLine[], turns: number): Line[] {
  return raw
    .map((l) => {
      const text = l.lineText.trim();
      const pts =
        l.lineCornerPoints?.length === 4
          ? l.lineCornerPoints
          : [
              { x: l.lineFrame.x, y: l.lineFrame.y },
              { x: l.lineFrame.x + l.lineFrame.width, y: l.lineFrame.y + l.lineFrame.height },
            ];
      if (turns === 0 && !l.lineCornerPoints?.length)
        return { text, x: l.lineFrame.x, y: l.lineFrame.y, h: l.lineFrame.height };
      const r = pts.map((p) => unrotate(p.x, p.y, turns));
      const xs = r.map((p) => p[0]);
      const ys = r.map((p) => p[1]);
      return { text, x: Math.min(...xs), y: Math.min(...ys), h: Math.max(...ys) - Math.min(...ys) };
    })
    .filter((l) => l.text.length > 0);
}

export function parseCardText(result: Text): CardGuess {
  const raw = result.blocks.flatMap((b) => b.lines);
  const turns = textTurns(raw);
  const lines: Line[] = uprightLines(raw, turns);
  const guess: CardGuess = {
    name: null,
    setCode: null,
    total: null,
    collectorNumber: null,
    foil: false,
    rawText: result.resultText,
    turns,
  };
  if (lines.length === 0) return guess;

  const top = Math.min(...lines.map((l) => l.y));
  const bottom = Math.max(...lines.map((l) => l.y + l.h));
  const height = Math.max(bottom - top, 1);
  const rel = (l: Line) => (l.y - top) / height;

  const bottomLines = lines.filter((l) => rel(l) > 0.6).sort((a, b) => b.y - a.y);
  for (const l of bottomLines) {
    const m = l.text.match(NUMBER);
    if (m && /\d/.test(m[1]) && /\d/.test(m[2])) {
      guess.collectorNumber = cardNumberOf(m[1]);
      const total = Number(digits(m[2]).replace(/^[A-Z]+/, ''));
      guess.total = Number.isFinite(total) && total > 0 ? total : null;
      const code = l.text.toUpperCase().match(PRINTED_CODE);
      if (code && /[A-Z]/.test(code[1])) guess.setCode = code[1];
      break;
    }
  }

  const topLines = lines.filter((l) => rel(l) < 0.22).sort((a, b) => a.y - b.y || a.x - b.x);
  let fallback: { name: string; line: Line } | null = null;
  for (const l of topLines) {
    const cleaned = cleanName(l.text);
    if (!cleaned || cleaned.toLowerCase() === 'energy') continue;
    const partialEnergy = cleaned.split(' ')[0].length <= 3 ? energyName(cleaned, result.resultText) : null;
    const known = partialEnergy ?? closestName(cleaned);
    if (known) {
      guess.name = known;
      guess.nameBox = { x: l.x, y: l.y, h: l.h };
      break;
    }
    fallback ??= { name: cleaned, line: l };
  }
  if (!guess.name && fallback) {
    guess.name = energyName(fallback.name, result.resultText) ?? fallback.name;
    guess.nameBox = { x: fallback.line.x, y: fallback.line.y, h: fallback.line.h };
  }
  return guess;
}

const ENERGY_TYPES = ['Grass', 'Fire', 'Water', 'Lightning', 'Psychic', 'Fighting', 'Darkness', 'Metal', 'Fairy'];

export function energyName(name: string, rawText: string): string | null {
  const m = name.match(/^(.*?)\s*energy$/i);
  if (!m) return null;
  const seen = ENERGY_TYPES.filter((t) => new RegExp(`\\b${t}\\b`, 'i').test(rawText));
  if (seen.length === 1) return `${seen[0]} Energy`;
  const part = m[1].replace(/[^a-z]/gi, '').toLowerCase();
  if (!part) return null;
  const fits = ENERGY_TYPES.filter((t) => t.toLowerCase().endsWith(part) || t.toLowerCase().startsWith(part));
  return fits.length === 1 ? `${fits[0]} Energy` : null;
}

export function parseNumberStrip(result: Text): Pick<CardGuess, 'collectorNumber' | 'total' | 'setCode' | 'rawText'> {
  const out: Pick<CardGuess, 'collectorNumber' | 'total' | 'setCode' | 'rawText'> = {
    collectorNumber: null,
    total: null,
    setCode: null,
    rawText: result.resultText,
  };
  const raw = result.blocks.flatMap((b) => b.lines);
  const lines = uprightLines(raw, textTurns(raw)).sort((a, b) => b.y - a.y);
  for (const l of lines) {
    const m = l.text.match(NUMBER);
    if (!m || !/\d/.test(m[1]) || !/\d/.test(m[2])) continue;
    out.collectorNumber = cardNumberOf(m[1]);
    const total = Number(digits(m[2]).replace(/^[A-Z]+/, ''));
    out.total = Number.isFinite(total) && total > 0 ? total : null;
    const code = l.text.toUpperCase().match(PRINTED_CODE);
    if (code && /[A-Z]/.test(code[1])) out.setCode = code[1];
    break;
  }
  return out;
}

function cardNumberOf(token: string): string {
  const n = digits(token);
  const misread = n.match(/^([SB])(\d{1,2})$/);
  return stripLeadingZeros(misread ? `${misread[1] === 'S' ? '5' : '8'}${misread[2]}` : n);
}

function stripLeadingZeros(n: string): string {
  return n.replace(/^([A-Z]*)0+(?=\d)/, '$1');
}

export function cleanName(raw: string): string | null {
  if (NOT_NAME.test(raw.trim()) || /length|weight|lbs/i.test(raw)) return null;
  let s = raw
    .replace(/[^A-Za-zÀ-ÿ0-9 ,'.\-♀♂&]/g, ' ')
    .replace(/\b(HP|LV\.?)\s*[0-9OIl]+\b/gi, ' ')
    .replace(/\b[0-9OIl]{2,3}\s*HP\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  s = s.replace(/(\s+[0-9]{1,3})+$/, '').trim();
  const letters = (s.match(/[A-Za-zÀ-ÿ]/g) ?? []).length;
  if (letters < 3 || letters / s.length < 0.6) return null;
  return s;
}
