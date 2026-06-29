import * as pdfjsLib from 'pdfjs-dist';

const pdfDocCache = new WeakMap<Uint8Array, Promise<pdfjsLib.PDFDocumentProxy>>();

export const getCachedPdfjsDoc = (bytes: Uint8Array): Promise<pdfjsLib.PDFDocumentProxy> => {
  let cached = pdfDocCache.get(bytes);
  if (!cached) {
    // slice() is used to copy the bytes, avoiding detached array buffer errors when passed to the worker
    cached = pdfjsLib.getDocument({
      data: bytes.slice(),
      cMapUrl: `${window.location.origin}/cmaps/`,
      cMapPacked: true,
      standardFontDataUrl: `${window.location.origin}/standard_fonts/`,
      wasmUrl: `${window.location.origin}/wasm/`,
    }).promise;
    pdfDocCache.set(bytes, cached);
  }
  return cached;
};
