// Pravadh DocSign - PDF.js bundle (pdfjs-dist 4.10.38, Apache-2.0).
// Worker runs on the main thread (no blob/remote worker needed) via globalThis.pdfjsWorker.
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { WorkerMessageHandler } from 'pdfjs-dist/legacy/build/pdf.worker.mjs';
globalThis.pdfjsWorker = { WorkerMessageHandler };
globalThis.pdfjsLib = pdfjsLib;
