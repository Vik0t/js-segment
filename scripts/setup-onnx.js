import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ONNX_VERSION = '1.15.0';
const FILES = [
  'ort-wasm.wasm',
  'ort-wasm-simd.wasm',
  'ort-wasm-threaded.wasm',
  'ort-wasm-simd-threaded.wasm'
];

const ONNX_BASE_URL = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ONNX_VERSION}/dist`;
const OUTPUT_DIR = path.join(__dirname, 'public', 'onnxruntime');

// Create output directory if it doesn't exist
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Download each file
FILES.forEach(filename => {
  const url = `${ONNX_BASE_URL}/${filename}`;
  const outputPath = path.join(OUTPUT_DIR, filename);
  
  console.log(`Downloading ${url}...`);
  
  https.get(url, response => {
    if (response.statusCode !== 200) {
      console.error(`Failed to download ${filename}: ${response.statusCode} ${response.statusMessage}`);
      return;
    }

    const file = fs.createWriteStream(outputPath);
    response.pipe(file);

    file.on('finish', () => {
      file.close();
      console.log(`Downloaded ${filename}`);
    });
  }).on('error', err => {
    console.error(`Error downloading ${filename}:`, err.message);
  });
});