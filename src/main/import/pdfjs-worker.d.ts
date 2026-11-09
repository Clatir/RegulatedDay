// pdfjs-dist ships no types for its worker module; the main process only hands it over to pdfjs (`globalThis.pdfjsWorker`).
declare module 'pdfjs-dist/legacy/build/pdf.worker.mjs' {
  export const WorkerMessageHandler: unknown
}
