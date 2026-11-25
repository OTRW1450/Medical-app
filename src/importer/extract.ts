// Reads text from PDFs, photos and text files – entirely on this device.
// PDFs with a text layer are read directly (pdf.js). Scanned pages and photos
// go through Tesseract OCR, loaded from the app's own files (no CDN).
import type { PDFPageProxy } from 'pdfjs-dist';

export interface ExtractProgress {
  stage: 'reading' | 'ocr-loading' | 'ocr';
  page?: number;
  pages?: number;
  /** 0..1 within the current stage */
  pct?: number;
}

export interface Extracted {
  text: string;
  pages: number;
  ocrPages: number;
  /** average OCR confidence 0-100 when OCR was used */
  ocrConfidence?: number;
}

const vendor = (p: string) => new URL(`vendor/${p}`, document.baseURI).href;

// ---------------------------------------------------------------- pdf.js

let pdfjsPromise: Promise<typeof import('pdfjs-dist')> | null = null;
function pdfjs() {
  pdfjsPromise ??= (async () => {
    const [lib, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]);
    lib.GlobalWorkerOptions.workerSrc = worker.default;
    return lib;
  })();
  return pdfjsPromise;
}

interface Item {
  str: string;
  x: number;
  y: number;
  w: number;
  size: number;
}

/** Rebuild visual lines from pdf.js text items, keeping column gaps as double spaces. */
export function itemsToLines(items: Item[]): string[] {
  const sorted = items.filter((i) => i.str.trim()).sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: Item[][] = [];
  for (const it of sorted) {
    const line = lines[lines.length - 1];
    if (line && Math.abs(line[0].y - it.y) <= Math.max(2, Math.min(line[0].size, it.size) * 0.45)) line.push(it);
    else lines.push([it]);
  }
  return lines.map((line) => {
    line.sort((a, b) => a.x - b.x);
    let out = '';
    let end = -Infinity;
    for (const it of line) {
      const gap = it.x - end;
      if (out) out += gap > it.size * 1.2 ? '   ' : gap > it.size * 0.12 ? ' ' : '';
      out += it.str;
      end = it.x + it.w;
    }
    return out.replace(/[ \t]+$/, '');
  });
}

async function pageText(page: PDFPageProxy): Promise<string> {
  const tc = await page.getTextContent();
  const items: Item[] = [];
  for (const it of tc.items) {
    if (!('str' in it)) continue;
    const [a, b, , , e, f] = it.transform as number[];
    items.push({ str: it.str, x: e, y: f, w: it.width, size: Math.hypot(a, b) || it.height || 10 });
  }
  return itemsToLines(items).join('\n');
}

// ---------------------------------------------------------------- OCR

type TWorker = Awaited<ReturnType<(typeof import('tesseract.js'))['createWorker']>>;
let ocrWorker: Promise<TWorker> | null = null;
let ocrProgress: ((p: number) => void) | null = null;

function getOcr(onLoad: (p: ExtractProgress) => void): Promise<TWorker> {
  ocrWorker ??= (async () => {
    onLoad({ stage: 'ocr-loading', pct: 0 });
    const { createWorker, OEM, PSM } = await import('tesseract.js');
    const w = await createWorker('eng', OEM.LSTM_ONLY, {
      workerPath: vendor('tesseract/worker.min.js'),
      corePath: vendor('tesseract/'),
      langPath: vendor('tesseract/'),
      workerBlobURL: false,
      gzip: true,
      cacheMethod: 'none', // the service worker caches the files instead
      logger: (m: { status: string; progress: number }) => {
        if (m.status === 'recognizing text') ocrProgress?.(m.progress);
        else onLoad({ stage: 'ocr-loading', pct: m.progress });
      },
    });
    await w.setParameters({ preserve_interword_spaces: '1', tessedit_pageseg_mode: PSM.AUTO });
    return w;
  })();
  ocrWorker.catch(() => (ocrWorker = null));
  return ocrWorker;
}

export async function stopOcr() {
  if (ocrWorker) {
    const w = await ocrWorker.catch(() => null);
    ocrWorker = null;
    await w?.terminate();
  }
}

async function ocrImage(img: HTMLCanvasElement | Blob, onProgress: (p: ExtractProgress) => void, page = 1, pages = 1) {
  const w = await getOcr(onProgress);
  ocrProgress = (pct) => onProgress({ stage: 'ocr', page, pages, pct });
  onProgress({ stage: 'ocr', page, pages, pct: 0 });
  const r = await w.recognize(img);
  return { text: r.data.text, confidence: r.data.confidence };
}

async function renderPage(page: PDFPageProxy): Promise<HTMLCanvasElement> {
  const base = page.getViewport({ scale: 1 });
  // ~300 dpi for a letter/A4 page, capped to keep memory reasonable on phones
  const scale = Math.min(4, 2500 / Math.max(base.width, base.height));
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport, canvas }).promise;
  return canvas;
}

// ---------------------------------------------------------------- entry point

/** Normalise typography from PDFs: ligatures (ﬁ), non-breaking spaces, odd dashes. */
export function normalizeText(t: string): string {
  return t.normalize('NFKC').replace(/[\u00a0\u2007\u202f]/g, ' ').replace(/[\u2010\u2011\u2012\u2212]/g, '-').replace(/\u00ad/g, '');
}

/**
 * Does a page's text layer look like real words? Scanned PDFs often carry a poor
 * hidden OCR layer from the scanner, which reads as gibberish.
 */
export function looksLikeGibberish(t: string): boolean {
  const words = t.split(/\s+/).filter((w) => w.length >= 3);
  if (words.length < 8) return false;
  const good = words.filter((w) => /^[A-Za-z][a-z]+[.,:;)]?$|^[A-Z]{2,}[.,:;)]?$|^[<>]?\d+([.,/:-]\d+)*[.,%)]?$/.test(w) && (/[aeiouy]/i.test(w) || /\d/.test(w) || /^[A-Z]{2,5}$/.test(w)));
  const weird = (t.match(/[^\x20-\x7E\n\t°µ±≤≥–—‘’“”•·…©®é]/g) ?? []).length / Math.max(1, t.length);
  return good.length / words.length < 0.55 || weird > 0.08;
}

export async function sha256(buf: ArrayBuffer): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function fileKind(f: File): 'pdf' | 'image' | 'text' | 'unsupported' {
  const n = f.name.toLowerCase();
  if (f.type === 'application/pdf' || n.endsWith('.pdf')) return 'pdf';
  if (f.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp|tiff?|heic)$/.test(n)) return 'image';
  if (f.type.startsWith('text/') || /\.(txt|md|csv|rtf)$/.test(n)) return 'text';
  return 'unsupported';
}

export async function extractText(file: File, onProgress: (p: ExtractProgress) => void, opts: { forceOcr?: boolean } = {}): Promise<Extracted> {
  const kind = fileKind(file);
  if (kind === 'text') return { text: normalizeText(await file.text()), pages: 1, ocrPages: 0 };
  if (kind === 'image') {
    const r = await ocrImage(file, onProgress);
    return { text: normalizeText(r.text), pages: 1, ocrPages: 1, ocrConfidence: r.confidence };
  }
  if (kind !== 'pdf') throw new Error('This file type can’t be read. Use PDF, a photo (JPG/PNG) or a text file.');
  const lib = await pdfjs();
  const task = lib.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    wasmUrl: vendor('pdfjs/wasm/'),
    standardFontDataUrl: vendor('pdfjs/standard_fonts/'),
    useSystemFonts: false,
  });
  const doc = await task.promise;
  const texts: string[] = [];
  let ocrPages = 0;
  const conf: number[] = [];
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      onProgress({ stage: 'reading', page: i, pages: doc.numPages });
      const page = await doc.getPage(i);
      let t = opts.forceOcr ? '' : normalizeText(await pageText(page));
      // A page with (almost) no text layer is a scan or photo – read it with OCR.
      // So is one whose hidden text layer is gibberish (poor scanner OCR).
      if (t.replace(/\s/g, '').length < 40 || looksLikeGibberish(t)) {
        const canvas = await renderPage(page);
        const r = await ocrImage(canvas, onProgress, i, doc.numPages);
        t = normalizeText(r.text);
        conf.push(r.confidence);
        ocrPages++;
        canvas.width = canvas.height = 0;
      }
      texts.push(t);
      page.cleanup();
    }
  } finally {
    await task.destroy();
  }
  return { text: texts.join('\n\n'), pages: texts.length, ocrPages, ocrConfidence: conf.length ? conf.reduce((a, b) => a + b, 0) / conf.length : undefined };
}
