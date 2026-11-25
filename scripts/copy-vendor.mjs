// Copies the PDF reader and text-recognition (OCR) files from node_modules into
// public/vendor so the app serves them itself and never needs a CDN.
import { cpSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const nm = join(root, 'node_modules');
const out = join(root, 'public', 'vendor');
rmSync(out, { recursive: true, force: true });

const copy = (from, to) => {
  const src = join(nm, from);
  if (!existsSync(src)) throw new Error(`Missing ${src} – run npm install`);
  mkdirSync(dirname(join(out, to)), { recursive: true });
  cpSync(src, join(out, to), { recursive: true });
};

// pdf.js helpers (image decoders for scanned PDFs, standard fonts)
for (const f of ['jbig2.wasm', 'openjpeg.wasm', 'qcms_bg.wasm', 'jbig2_nowasm_fallback.js', 'openjpeg_nowasm_fallback.js'])
  copy(`pdfjs-dist/wasm/${f}`, `pdfjs/wasm/${f}`);
copy('pdfjs-dist/standard_fonts', 'pdfjs/standard_fonts');

// Tesseract OCR: worker, the three LSTM engine builds (one is picked per device), English model
copy('tesseract.js/dist/worker.min.js', 'tesseract/worker.min.js');
for (const f of ['tesseract-core-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js', 'tesseract-core-relaxedsimd-lstm.wasm.js'])
  copy(`tesseract.js-core/${f}`, `tesseract/${f}`);
copy('@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', 'tesseract/eng.traineddata.gz');
console.log('vendor files copied to public/vendor');
