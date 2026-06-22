import React, { useState, useRef } from 'react';
import { Layers } from 'lucide-react';
import * as PDFLib from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import type { Document, Page, TextBlock, DrawingStroke, Watermark } from './types';
import { Workspace } from './components/Workspace';
import { EditorOverlay } from './components/EditorOverlay';
import { Loader } from './components/Loader';

// Initialize PDF.js worker using Vite's asset bundling
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  '../node_modules/pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'danger' | 'info';
}

// Coordinate helper to translate visual percentages to physical PDF coordinates depending on page rotation
const transformCoords = (xPct: number, yPct: number, width: number, height: number, rotation: number) => {
  const theta = (rotation + 360) % 360;
  if (theta === 90) {
    // 90 deg clockwise: visual width is height, visual height is width
    return {
      x: (yPct / 100) * width,
      y: (xPct / 100) * height,
    };
  } else if (theta === 180) {
    // 180 deg: visual width is width, visual height is height
    return {
      x: width - (xPct / 100) * width,
      y: (yPct / 100) * height,
    };
  } else if (theta === 270) {
    // 270 deg clockwise: visual width is height, visual height is width
    return {
      x: width - (yPct / 100) * width,
      y: height - (xPct / 100) * height,
    };
  } else {
    // 0 deg
    return {
      x: (xPct / 100) * width,
      y: height - (yPct / 100) * height,
    };
  }
};

const generateUniqueId = (prefix: string) => {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1000000).toString(36)}`;
};

export const App: React.FC = () => {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [editorMode, setEditorMode] = useState<'text' | 'organize'>('text');
  const [activeTextBlockId, setActiveTextBlockId] = useState<string | null>(null);
  
  // Temporary editing document state (scratch copy)
  const [editingDoc, setEditingDoc] = useState<Document | null>(null);
  const [pdfjsDoc, setPdfjsDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);

  // Undo / Redo History States
  const [history, setHistory] = useState<Document[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const historyDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Loading States
  const [loading, setLoading] = useState(false);
  const [loaderTitle, setLoaderTitle] = useState('');
  const [loaderSubtitle, setLoaderSubtitle] = useState('');

  // Toasts
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = (message: string, type: 'success' | 'danger' | 'info' = 'info') => {
    const id = generateUniqueId('toast');
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  const showLoader = (title: string, subtitle = 'Por favor, espera...') => {
    setLoaderTitle(title);
    setLoaderSubtitle(subtitle);
    setLoading(true);
  };

  const hideLoader = () => {
    setLoading(false);
  };

  // State update wrapper with Undo/Redo history stack support
  const updateEditingDocState = (newDoc: Document, pushToHistory = true, debounce = false) => {
    setEditingDoc(newDoc);
    if (!pushToHistory) return;

    if (debounce) {
      if (historyDebounceRef.current) clearTimeout(historyDebounceRef.current);
      historyDebounceRef.current = setTimeout(() => {
        setHistory((prev) => {
          const nextHist = prev.slice(0, historyIndex + 1);
          return [...nextHist, JSON.parse(JSON.stringify(newDoc))];
        });
        setHistoryIndex((prev) => prev + 1);
      }, 300);
    } else {
      setHistory((prev) => {
        const nextHist = prev.slice(0, historyIndex + 1);
        return [...nextHist, JSON.parse(JSON.stringify(newDoc))];
      });
      setHistoryIndex((prev) => prev + 1);
    }
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      const newIdx = historyIndex - 1;
      setHistoryIndex(newIdx);
      setEditingDoc(JSON.parse(JSON.stringify(history[newIdx])));
      showToast("Deshacer aplicado.", "info");
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const newIdx = historyIndex + 1;
      setHistoryIndex(newIdx);
      setEditingDoc(JSON.parse(JSON.stringify(history[newIdx])));
      showToast("Rehacer aplicado.", "info");
    }
  };

  /* ==========================================================================
     Workspace Handlers (Epic 1)
     ========================================================================== */

  // Load dropped or selected files
  const handleFilesSelect = async (filesList: FileList | File[]) => {
    const pdfFiles = Array.from(filesList).filter((f) => f.name.toLowerCase().endsWith('.pdf'));

    if (pdfFiles.length === 0) {
      showToast("Por favor, selecciona solo archivos con extensión .pdf", "danger");
      return;
    }

    showLoader("Cargando archivos PDF", `Procesando ${pdfFiles.length} archivo(s)...`);

    const newLoadedDocs: Document[] = [];

    for (const file of pdfFiles) {
      try {
        const bytes = await readFileAsBytes(file);

        // Load using pdf-lib to read metadata & page counts
        const pdfDoc = await PDFLib.PDFDocument.load(bytes);
        const pageCount = pdfDoc.getPageCount();

        // Read and parse custom Keyword text block annotations
        const keywords = pdfDoc.getKeywords() || '';
        const match = keywords.split(/,\s*/).find((k) => k.startsWith('pdfedit:'));
        let textBlocks: TextBlock[] = [];
        let drawings: DrawingStroke[] = [];
        let watermark: Watermark | undefined = undefined;

        if (match) {
          try {
            const base64Data = match.substring('pdfedit:'.length);
            const jsonStr = decodeURIComponent(escape(atob(base64Data)));
            const meta = JSON.parse(jsonStr);
            if (meta && Array.isArray(meta.textBlocks)) {
              textBlocks = meta.textBlocks;
            }
            if (meta && Array.isArray(meta.drawings)) {
              drawings = meta.drawings;
            }
            if (meta && meta.watermark) {
              watermark = meta.watermark;
            }
          } catch (metaErr) {
            console.error("Error decoding custom PDF Keywords metadata:", metaErr);
          }
        }

        const docId = generateUniqueId('doc');
        const docPages: Page[] = Array.from({ length: pageCount }, (_, i) => ({
          originalIndex: i,
          pageId: generateUniqueId('page'),
          rotation: 0,
        }));

        // Map pageIndex to pageId
        textBlocks.forEach((tb) => {
          if (tb.pageIndex !== undefined && docPages[tb.pageIndex]) {
            tb.pageId = docPages[tb.pageIndex].pageId;
          } else {
            tb.pageId = docPages[0]?.pageId || '';
          }
        });

        const docName = file.name.replace(/\.[^/.]+$/, "");

        const newDoc: Document = {
          id: docId,
          name: docName,
          rawBytes: bytes,
          pages: docPages,
          textBlocks: textBlocks,
          loadedTextBlocks: JSON.parse(JSON.stringify(textBlocks)),
          drawings: drawings,
          watermark: watermark,
        };

        newLoadedDocs.push(newDoc);
        showToast(`Cargado: "${file.name}" (${pageCount} pág.)`, "success");
        if (textBlocks.length > 0) {
          showToast(`Detectados ${textBlocks.length} bloques de texto editables en "${docName}"`, "info");
        }
      } catch (err) {
        console.error("Error loading file in React:", err);
        showToast(`Error al cargar "${file.name}"`, "danger");
      }
    }

    if (newLoadedDocs.length > 0) {
      setDocuments((prev) => [...prev, ...newLoadedDocs]);
    }
    hideLoader();
  };

  const readFileAsBytes = (file: File): Promise<Uint8Array> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  };

  // Generate A4 Sample PDFs
  const generateSamplePdf = async (name: string, pagesCount = 3): Promise<Uint8Array> => {
    const pdfDoc = await PDFLib.PDFDocument.create();
    const font = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);

    for (let i = 0; i < pagesCount; i++) {
      const page = pdfDoc.addPage([595.28, 841.89]); // A4 size in points

      // Header Color Accent
      page.drawRectangle({
        x: 0,
        y: 831.89,
        width: 595.28,
        height: 10,
        color: PDFLib.rgb(0.388, 0.4, 0.945),
      });

      page.drawText(`Documento de Prueba: ${name}`, {
        x: 50,
        y: 740,
        size: 24,
        font: font,
        color: PDFLib.rgb(0.388, 0.4, 0.945),
      });

      page.drawText(`Página ${i + 1} de este documento PDF generado 100% en el cliente.`, {
        x: 50,
        y: 695,
        size: 13,
        font: font,
        color: PDFLib.rgb(0.39, 0.45, 0.55),
      });

      page.drawText("Este archivo de ejemplo te permite probar todas las capacidades del editor:", {
        x: 50,
        y: 620,
        size: 11,
        font: font,
        color: PDFLib.rgb(0.1, 0.1, 0.1),
      });

      const items = [
        "- Edición de texto y agregado de bloques interactivos en tiempo real.",
        "- Cambio de tipografías (Helvetica, Times, Courier), colores y tamaños de fuente.",
        "- Reordenamiento visual de páginas mediante Drag & Drop (modo 'Organizar').",
        "- Eliminación de páginas innecesarias de la secuencia del documento.",
        "- Persistencia inteligente: los bloques siguen siendo editables al re-subir el PDF."
      ];

      let currentY = 590;
      for (const item of items) {
        page.drawText(item, {
          x: 65,
          y: currentY,
          size: 10,
          font: font,
          color: PDFLib.rgb(0.25, 0.25, 0.25),
        });
        currentY -= 20;
      }

      page.drawText(`Pág. ${i + 1} / ${pagesCount}`, {
        x: 270,
        y: 40,
        size: 10,
        font: font,
        color: PDFLib.rgb(0.5, 0.5, 0.5),
      });
    }

    return await pdfDoc.save();
  };

  const handleGenerateSample = async () => {
    const nextLetter = String.fromCharCode(65 + documents.length);
    const docName = `Documento_${nextLetter}`;
    showLoader("Generando PDF de prueba...", "Creando un PDF estructurado de 3 páginas en el navegador...");

    try {
      const bytes = await generateSamplePdf(docName, 3);
      const pdfDoc = await PDFLib.PDFDocument.load(bytes);
      const pageCount = pdfDoc.getPageCount();

      const docId = generateUniqueId('doc');
      const docPages: Page[] = Array.from({ length: pageCount }, (_, i) => ({
        originalIndex: i,
        pageId: generateUniqueId('page'),
        rotation: 0,
      }));

      const newDoc: Document = {
        id: docId,
        name: docName,
        rawBytes: bytes,
        pages: docPages,
        textBlocks: [],
        loadedTextBlocks: [],
        drawings: [],
      };

      setDocuments((prev) => [...prev, newDoc]);
      showToast(`PDF de prueba creado: "${docName}.pdf"`, "success");
    } catch (err) {
      console.error("Error generating sample in React:", err);
      showToast("Error al crear PDF de prueba", "danger");
    } finally {
      hideLoader();
    }
  };

  const handleRenameDocument = (id: string, newName: string) => {
    setDocuments((prev) =>
      prev.map((doc) => (doc.id === id ? { ...doc, name: newName } : doc))
    );
  };

  const handleDeleteDocument = (id: string) => {
    setDocuments((prev) => prev.filter((doc) => doc.id !== id));
    showToast("Documento eliminado de la mesa de trabajo.", "info");
  };

  const handleReorderDocuments = (sortedIds: string[]) => {
    setDocuments((prev) => {
      const sorted = [];
      for (const id of sortedIds) {
        const doc = prev.find((d) => d.id === id);
        if (doc) sorted.push(doc);
      }
      return sorted;
    });
  };

  // Merge loaded PDF documents
  const handleMergeDocuments = async (filename: string) => {
    if (documents.length < 2) return;

    showLoader("Combinando PDFs", "Generando el documento combinado y unificando anotaciones...");

    try {
      const mergedPdf = await PDFLib.PDFDocument.create();
      const mergedTextBlocks: TextBlock[] = [];
      let pageOffset = 0;

      for (const doc of documents) {
        const srcDoc = await PDFLib.PDFDocument.load(doc.rawBytes);
        const pageCount = srcDoc.getPageCount();

        // Copy pages
        const pageIndices = Array.from({ length: pageCount }, (_, i) => i);
        const copiedPages = await mergedPdf.copyPages(srcDoc, pageIndices);
        copiedPages.forEach((page) => mergedPdf.addPage(page));

        // Offset block coordinates
        doc.textBlocks.forEach((tb) => {
          mergedTextBlocks.push({
            id: tb.id,
            pageId: tb.pageId,
            text: tb.text,
            x: tb.x,
            y: tb.y,
            pageIndex: (tb.pageIndex ?? 0) + pageOffset,
            font: tb.font,
            fontSize: tb.fontSize,
            color: tb.color,
          });
        });

        pageOffset += pageCount;
      }

      // Embed serialised merged blocks in Keywords
      const metadata = {
        version: "1.0",
        textBlocks: mergedTextBlocks,
      };
      const base64Metadata = btoa(unescape(encodeURIComponent(JSON.stringify(metadata))));
      mergedPdf.setKeywords([`pdfedit:${base64Metadata}`]);

      const mergedBytes = await mergedPdf.save();
      downloadBytes(mergedBytes, filename);
      showToast(`PDF combinado descargado con éxito: "${filename}"`, "success");
    } catch (err) {
      console.error("Error merging PDFs in React:", err);
      showToast("Error al combinar los archivos PDF", "danger");
    } finally {
      hideLoader();
    }
  };

  const downloadBytes = (bytes: Uint8Array, filename: string) => {
    const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  /* ==========================================================================
     Advanced Editor Functions (Epic 2 & 3)
     ========================================================================== */

  const handleOpenEditor = async (docId: string) => {
    const doc = documents.find((d) => d.id === docId);
    if (!doc) return;

    setEditorMode('text');
    setActiveTextBlockId(null);

    // Deep clone doc values for temporary editing
    const tempEditingDoc: Document = {
      id: doc.id,
      name: doc.name,
      pages: JSON.parse(JSON.stringify(doc.pages)),
      textBlocks: JSON.parse(JSON.stringify(doc.textBlocks)),
      loadedTextBlocks: JSON.parse(JSON.stringify(doc.loadedTextBlocks)),
      rawBytes: doc.rawBytes,
      drawings: JSON.parse(JSON.stringify(doc.drawings || [])),
      watermark: doc.watermark ? { ...doc.watermark } : undefined,
    };
    
    setEditingDoc(tempEditingDoc);
    setHistory([JSON.parse(JSON.stringify(tempEditingDoc))]);
    setHistoryIndex(0);

    showLoader("Cargando Editor", "Cargando páginas del PDF y preparando espacio de trabajo...");

    try {
      // Use slice() copy to avoid buffer detachment in worker
      const pdfjs = await pdfjsLib.getDocument({
        data: doc.rawBytes.slice(),
        cMapUrl: `${window.location.origin}/cmaps/`,
        cMapPacked: true,
        standardFontDataUrl: `${window.location.origin}/standard_fonts/`,
        wasmUrl: `${window.location.origin}/wasm/`,
      }).promise;
      setPdfjsDoc(pdfjs);
    } catch (err) {
      console.error("Error opening editor in React:", err);
      showToast("Error al iniciar el editor avanzado", "danger");
      handleCloseEditor();
    } finally {
      hideLoader();
    }
  };

  const handleCloseEditor = () => {
    setEditingDoc(null);
    setPdfjsDoc(null);
    setActiveTextBlockId(null);
    setEditorMode('text');
    setHistory([]);
    setHistoryIndex(-1);
    if (historyDebounceRef.current) clearTimeout(historyDebounceRef.current);
  };

  const handleAddTextBlock = (pageId: string, xPercent: number, yPercent: number) => {
    if (!editingDoc) return;

    const newBlock: TextBlock = {
      id: generateUniqueId('block'),
      pageId,
      text: '',
      x: xPercent,
      y: yPercent,
      font: 'Helvetica',
      fontSize: 14,
      color: '#000000',
    };

    const updatedDoc = {
      ...editingDoc,
      textBlocks: [...editingDoc.textBlocks, newBlock],
    };
    updateEditingDocState(updatedDoc, true, false);

    setActiveTextBlockId(newBlock.id);
  };

  const handleSelectBlock = (id: string) => {
    setActiveTextBlockId(id);
  };

  const handleMoveBlock = (id: string, x: number, y: number) => {
    if (!editingDoc) return;
    const updatedDoc = {
      ...editingDoc,
      textBlocks: editingDoc.textBlocks.map((b) => (b.id === id ? { ...b, x, y } : b)),
    };
    updateEditingDocState(updatedDoc, true, true);
  };

  const handleDeleteBlock = (id: string) => {
    if (!editingDoc) return;
    const updatedDoc = {
      ...editingDoc,
      textBlocks: editingDoc.textBlocks.filter((b) => b.id !== id),
    };
    updateEditingDocState(updatedDoc, true, false);
    if (activeTextBlockId === id) {
      setActiveTextBlockId(null);
    }
    showToast("Bloque de texto eliminado.", "info");
  };

  const handleChangeTextBlockText = (id: string, text: string) => {
    if (!editingDoc) return;
    const updatedDoc = {
      ...editingDoc,
      textBlocks: editingDoc.textBlocks.map((b) => (b.id === id ? { ...b, text } : b)),
    };
    updateEditingDocState(updatedDoc, true, true);
  };

  const handleUpdateBlockStyle = (
    id: string,
    style: { font?: 'Helvetica' | 'TimesNewRoman' | 'Courier'; fontSize?: number; color?: string }
  ) => {
    if (!editingDoc) return;
    const updatedDoc = {
      ...editingDoc,
      textBlocks: editingDoc.textBlocks.map((b) => (b.id === id ? { ...b, ...style } : b)),
    };
    updateEditingDocState(updatedDoc, true, false);
  };

  const handleDeselectBlocks = () => {
    setActiveTextBlockId(null);
  };

  const handleReorderPages = (sortedPageIds: string[]) => {
    if (!editingDoc) return;
    const sorted = [];
    for (const id of sortedPageIds) {
      const p = editingDoc.pages.find((page) => page.pageId === id);
      if (p) sorted.push(p);
    }
    const updatedDoc = {
      ...editingDoc,
      pages: sorted,
    };
    updateEditingDocState(updatedDoc, true, false);
  };

  const handleDeletePage = (pageId: string) => {
    if (!editingDoc) return;
    if (editingDoc.pages.length <= 1) {
      showToast("Un documento PDF debe tener al menos una página.", "danger");
      return;
    }

    const updatedDoc = {
      ...editingDoc,
      pages: editingDoc.pages.filter((p) => p.pageId !== pageId),
      textBlocks: editingDoc.textBlocks.filter((b) => b.pageId !== pageId),
      drawings: (editingDoc.drawings || []).filter((d) => d.pageId !== pageId),
    };
    updateEditingDocState(updatedDoc, true, false);
    showToast("Página eliminada de la secuencia.", "info");
  };

  // Drawing Actions
  const handleAddDrawingStroke = (_pageId: string, stroke: DrawingStroke) => {
    if (!editingDoc) return;
    const drawings = editingDoc.drawings || [];
    const updatedDoc = {
      ...editingDoc,
      drawings: [...drawings, stroke],
    };
    updateEditingDocState(updatedDoc, true, false);
  };

  const handleDeleteDrawingStroke = (_pageId: string, strokeId: string) => {
    if (!editingDoc) return;
    const drawings = editingDoc.drawings || [];
    const updatedDoc = {
      ...editingDoc,
      drawings: drawings.filter((d) => d.id !== strokeId),
    };
    updateEditingDocState(updatedDoc, true, false);
  };

  const handleUpdateWatermark = (watermark: Watermark | undefined) => {
    if (!editingDoc) return;
    const updatedDoc = {
      ...editingDoc,
      watermark,
    };
    updateEditingDocState(updatedDoc, true, false);
  };

  const handleRotatePage = (pageId: string, angleDelta: number) => {
    if (!editingDoc) return;
    const updatedDoc = {
      ...editingDoc,
      pages: editingDoc.pages.map((p) => {
        if (p.pageId !== pageId) return p;
        const currentRotation = p.rotation || 0;
        const newRotation = (currentRotation + angleDelta + 360) % 360;
        return {
          ...p,
          rotation: newRotation,
        };
      }),
    };
    updateEditingDocState(updatedDoc, true, false);
  };

  const handleRotateDocument = async (docId: string, angleDelta: number) => {
    const doc = documents.find((d) => d.id === docId);
    if (!doc) return;

    showLoader("Rotando Documento", "Aplicando rotación a todas las páginas...");

    try {
      const rotatedPages = doc.pages.map((p) => {
        const currentRotation = p.rotation || 0;
        const newRotation = (currentRotation + angleDelta + 360) % 360;
        return {
          ...p,
          rotation: newRotation,
        };
      });

      const docToCompile = {
        ...doc,
        pages: rotatedPages,
      };

      const { newBytes, savedPages, savedBlocks } = await compileEditingDoc(docToCompile);

      setDocuments((prev) =>
        prev.map((d) => {
          if (d.id !== docId) return d;
          return {
            ...d,
            rawBytes: newBytes,
            pages: savedPages,
            textBlocks: savedBlocks,
            loadedTextBlocks: JSON.parse(JSON.stringify(savedBlocks)),
          };
        })
      );
      showToast("Documento rotado con éxito.", "success");
    } catch (err) {
      console.error("Error rotating document:", err);
      showToast("Error al rotar el documento", "danger");
    } finally {
      hideLoader();
    }
  };

  const handleInsertBlankPage = (afterIndex: number) => {
    if (!editingDoc) return;
    const confirmInsert = window.confirm("¿Estás seguro de que deseas insertar una página en blanco en esta posición?");
    if (!confirmInsert) return;

    const newPage: Page = {
      originalIndex: -1,
      pageId: generateUniqueId('page_blank'),
      isBlank: true,
      rotation: 0,
    };

    const newPages = [...editingDoc.pages];
    newPages.splice(afterIndex + 1, 0, newPage);

    const updatedDoc = {
      ...editingDoc,
      pages: newPages,
    };
    updateEditingDocState(updatedDoc, true, false);
    showToast("Página en blanco insertada.", "success");
  };

  const handleInsertPdfDrop = async (afterIndex: number, file: File) => {
    if (!editingDoc) return;

    showLoader("Procesando PDF a insertar...", "Leyendo páginas del archivo PDF seleccionado...");

    try {
      const bytes = await readFileAsBytes(file);
      const extPdfDoc = await PDFLib.PDFDocument.load(bytes);
      const pageCount = extPdfDoc.getPageCount();

      hideLoader();

      const confirmInsert = window.confirm(
        `¿Estás seguro de que deseas insertar las ${pageCount} páginas de "${file.name}" después de la posición seleccionada?`
      );
      if (!confirmInsert) return;

      showLoader("Insertando páginas...", "Preparando la secuencia de páginas...");

      const newPagesToInsert: Page[] = Array.from({ length: pageCount }, (_, i) => ({
        originalIndex: -1,
        pageId: generateUniqueId('page_ext') + '_' + i,
        externalBytes: bytes,
        externalOriginalIndex: i,
        rotation: 0,
      }));

      const newPages = [...editingDoc.pages];
      newPages.splice(afterIndex + 1, 0, ...newPagesToInsert);

      const updatedDoc = {
        ...editingDoc,
        pages: newPages,
      };
      
      updateEditingDocState(updatedDoc, true, false);
      showToast(`Insertadas ${pageCount} páginas de "${file.name}" con éxito.`, "success");
    } catch (err) {
      console.error("Error inserting PDF file:", err);
      showToast("Error al procesar e insertar el archivo PDF", "danger");
    } finally {
      hideLoader();
    }
  };

  // Compile PDF pages, burn drawings/text/watermarks, and save to workspace doc
  const compileEditingDoc = async (docToCompile: Document) => {
    const docRef = documents.find((d) => d.id === docToCompile.id);
    if (!docRef) throw new Error("Document reference not found in workspace");

    const originalPdfDoc = await PDFLib.PDFDocument.load(docRef.rawBytes);
    const newPdfDoc = await PDFLib.PDFDocument.create();

    for (let idx = 0; idx < docToCompile.pages.length; idx++) {
      const pageObj = docToCompile.pages[idx];

      let pdfPage;
      if (pageObj.isBlank) {
        // Create blank A4 page (595.28 x 841.89 points)
        pdfPage = newPdfDoc.addPage([595.28, 841.89]);
      } else if (pageObj.externalBytes) {
        const extPdfDoc = await PDFLib.PDFDocument.load(pageObj.externalBytes);
        const [copiedPage] = await newPdfDoc.copyPages(extPdfDoc, [pageObj.externalOriginalIndex ?? 0]);
        pdfPage = newPdfDoc.addPage(copiedPage);
      } else {
        const [copiedPage] = await newPdfDoc.copyPages(originalPdfDoc, [pageObj.originalIndex]);
        pdfPage = newPdfDoc.addPage(copiedPage);
      }

      const { width: pdfWidth, height: pdfHeight } = pdfPage.getSize();

      // Apply page rotation
      if (pageObj.rotation) {
        const rotationAngle = (pdfPage.getRotation().angle + pageObj.rotation) % 360;
        pdfPage.setRotation(PDFLib.degrees(rotationAngle));
      }

      // 1. Cover up previously burned blocks anchored to this pageId
      const coverups = docToCompile.loadedTextBlocks.filter((ob) => ob.pageId === pageObj.pageId);
      for (const ob of coverups) {
        let { x: obX, y: obY } = transformCoords(ob.x, ob.y, pdfWidth, pdfHeight, pageObj.rotation || 0);

        // Adjust baseline shift based on rotation
        const theta = (pageObj.rotation || 0) % 360;
        if (theta === 0) obY -= ob.fontSize * 0.85;
        else if (theta === 90) obX += ob.fontSize * 0.85;
        else if (theta === 180) obY += ob.fontSize * 0.85;
        else if (theta === 270) obX -= ob.fontSize * 0.85;

        let obFont;
        if (ob.font === 'TimesNewRoman') {
          obFont = await newPdfDoc.embedFont(PDFLib.StandardFonts.TimesRoman);
        } else if (ob.font === 'Courier') {
          obFont = await newPdfDoc.embedFont(PDFLib.StandardFonts.Courier);
        } else {
          obFont = await newPdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);
        }

        const textWidth = obFont.widthOfTextAtSize(ob.text, ob.fontSize);
        const textHeight = ob.fontSize * 1.25;

        pdfPage.drawRectangle({
          x: obX - 2,
          y: obY - 2,
          width: textWidth + 4,
          height: textHeight,
          color: PDFLib.rgb(1, 1, 1),
        });
      }

      // 2. Draw watermark first (in background)
      if (docToCompile.watermark && docToCompile.watermark.text) {
        const w = docToCompile.watermark;
        const font = await newPdfDoc.embedFont(PDFLib.StandardFonts.HelveticaBold);
        const textWidth = font.widthOfTextAtSize(w.text, w.fontSize);

        // Center visual rotation coordinate mapping
        const x = (pdfWidth - textWidth * Math.cos(Math.PI / 4)) / 2;
        const y = (pdfHeight - textWidth * Math.sin(Math.PI / 4)) / 2;

        const hex = w.color.replace(/^#/, '');
        const r = parseInt(hex.substring(0, 2), 16) / 255;
        const g = parseInt(hex.substring(2, 4), 16) / 255;
        const b = parseInt(hex.substring(4, 6), 16) / 255;

        pdfPage.drawText(w.text, {
          x,
          y,
          size: w.fontSize,
          font,
          color: PDFLib.rgb(r, g, b),
          opacity: w.opacity,
          rotate: PDFLib.degrees(45),
        });
      }

      // 3. Draw active text blocks anchored to this pageId
      const activeBlocks = docToCompile.textBlocks.filter((tb) => tb.pageId === pageObj.pageId);
      for (const block of activeBlocks) {
        if (!block.text.trim()) continue;

        let { x: pdfX, y: pdfY } = transformCoords(block.x, block.y, pdfWidth, pdfHeight, pageObj.rotation || 0);

        // Adjust baseline shift based on rotation
        const theta = (pageObj.rotation || 0) % 360;
        if (theta === 0) pdfY -= block.fontSize * 0.85;
        else if (theta === 90) pdfX += block.fontSize * 0.85;
        else if (theta === 180) pdfY += block.fontSize * 0.85;
        else if (theta === 270) pdfX -= block.fontSize * 0.85;

        const textRotation = theta === 0 ? 0 : 360 - theta;

        let pdfFont;
        if (block.font === 'TimesNewRoman') {
          pdfFont = await newPdfDoc.embedFont(PDFLib.StandardFonts.TimesRoman);
        } else if (block.font === 'Courier') {
          pdfFont = await newPdfDoc.embedFont(PDFLib.StandardFonts.Courier);
        } else {
          pdfFont = await newPdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);
        }

        const hex = block.color.replace(/^#/, '');
        const r = parseInt(hex.substring(0, 2), 16) / 255;
        const g = parseInt(hex.substring(2, 4), 16) / 255;
        const b = parseInt(hex.substring(4, 6), 16) / 255;

        pdfPage.drawText(block.text, {
          x: pdfX,
          y: pdfY,
          size: block.fontSize,
          font: pdfFont,
          color: PDFLib.rgb(r, g, b),
          rotate: PDFLib.degrees(textRotation),
        });
      }

      // 4. Draw drawings/highlights on top
      const activeDrawings = docToCompile.drawings?.filter((d) => d.pageId === pageObj.pageId) || [];
      for (const stroke of activeDrawings) {
        if (stroke.points.length < 2) continue;

        const hex = stroke.color.replace(/^#/, '');
        const r = parseInt(hex.substring(0, 2), 16) / 255;
        const g = parseInt(hex.substring(2, 4), 16) / 255;
        const b = parseInt(hex.substring(4, 6), 16) / 255;

        for (let i = 0; i < stroke.points.length - 1; i++) {
          const pt1 = stroke.points[i];
          const pt2 = stroke.points[i + 1];

          const { x: x1, y: y1 } = transformCoords(pt1.x, pt1.y, pdfWidth, pdfHeight, pageObj.rotation || 0);
          const { x: x2, y: y2 } = transformCoords(pt2.x, pt2.y, pdfWidth, pdfHeight, pageObj.rotation || 0);

          pdfPage.drawLine({
            start: { x: x1, y: y1 },
            end: { x: x2, y: y2 },
            thickness: stroke.width,
            color: PDFLib.rgb(r, g, b),
            opacity: stroke.type === 'highlight' ? 0.45 : 1.0,
          });
        }
      }
    }

    // 5. Serialize metadata to Keywords
    const serializedBlocks = docToCompile.textBlocks.map((block) => {
      const finalPageIndex = docToCompile.pages.findIndex((p) => p.pageId === block.pageId);
      return {
        text: block.text,
        x: block.x,
        y: block.y,
        pageIndex: finalPageIndex,
        font: block.font,
        fontSize: block.fontSize,
        color: block.color,
      };
    });

    const metadata = {
      version: "1.0",
      textBlocks: serializedBlocks,
      drawings: docToCompile.drawings || [],
      watermark: docToCompile.watermark,
    };

    const base64Metadata = btoa(unescape(encodeURIComponent(JSON.stringify(metadata))));
    newPdfDoc.setKeywords([`pdfedit:${base64Metadata}`]);

    const newBytes = await newPdfDoc.save();

    const savedPages = docToCompile.pages.map((p, index) => ({
      originalIndex: index,
      pageId: p.pageId,
      rotation: p.rotation,
      isBlank: p.isBlank,
      externalBytes: p.externalBytes,
      externalOriginalIndex: p.externalOriginalIndex,
    }));

    const savedBlocks = docToCompile.textBlocks.map((block) => {
      const finalIndex = docToCompile.pages.findIndex((p) => p.pageId === block.pageId);
      return {
        ...block,
        pageIndex: finalIndex,
      };
    });

    return {
      newBytes,
      savedPages,
      savedBlocks
    };
  };

  const handleSaveEditorChanges = async () => {
    if (!editingDoc) return;

    showLoader("Guardando Cambios", "Compilando PDF, fusionando capas de anotación y actualizando metadatos...");

    try {
      const { newBytes, savedPages, savedBlocks } = await compileEditingDoc(editingDoc);

      // Save to Workspace documents
      setDocuments((prev) =>
        prev.map((d) => {
          if (d.id !== editingDoc.id) return d;

          return {
            ...d,
            rawBytes: newBytes,
            pages: savedPages,
            textBlocks: savedBlocks,
            loadedTextBlocks: JSON.parse(JSON.stringify(savedBlocks)),
            drawings: JSON.parse(JSON.stringify(editingDoc.drawings || [])),
            watermark: editingDoc.watermark ? { ...editingDoc.watermark } : undefined,
          };
        })
      );

      showToast("Cambios guardados con éxito.", "success");
      handleCloseEditor();
    } catch (err) {
      console.error("Error compiling and saving PDF in React:", err);
      showToast("Error al guardar los cambios del documento", "danger");
    } finally {
      hideLoader();
    }
  };

  const handleDownloadEditorChanges = async () => {
    if (!editingDoc) return;

    showLoader("Preparando Descarga", "Compilando los cambios del editor para la descarga...");

    try {
      const { newBytes } = await compileEditingDoc(editingDoc);
      downloadBytes(newBytes, `${editingDoc.name}.pdf`);
      showToast("Descarga del archivo editado iniciada.", "success");
    } catch (err) {
      console.error("Error downloading compiled PDF in React:", err);
      showToast("Error al compilar y descargar el documento", "danger");
    } finally {
      hideLoader();
    }
  };

  return (
    <>
      {/* App Header */}
      <header className="app-header">
        <div className="header-container">
          <div className="logo">
            <Layers className="logo-icon" />
            <h1>
              Aero<span>PDF</span>
            </h1>
          </div>
          <div className="header-actions">
            <span className="status-indicator ready">
              <span className="dot"></span>100% Client-Side (React & TS)
            </span>
          </div>
        </div>
      </header>

      {/* Main Workspace Dashboard */}
      <Workspace
        documents={documents}
        onFilesSelect={handleFilesSelect}
        onGenerateSample={handleGenerateSample}
        onRename={handleRenameDocument}
        onEdit={handleOpenEditor}
        onDelete={handleDeleteDocument}
        onReorder={handleReorderDocuments}
        onMerge={handleMergeDocuments}
        onDownload={(doc) => downloadBytes(doc.rawBytes, `${doc.name}.pdf`)}
        onRotateDoc={handleRotateDocument}
      />

      {/* Advanced Editor Overlay */}
      {editingDoc && pdfjsDoc && (
        <EditorOverlay
          doc={editingDoc}
          editorMode={editorMode}
          activeTextBlockId={activeTextBlockId}
          pdfjsDoc={pdfjsDoc}
          onClose={handleCloseEditor}
          onSave={handleSaveEditorChanges}
          onDownload={handleDownloadEditorChanges}
          onSetMode={setEditorMode}
          onAddTextBlock={handleAddTextBlock}
          onSelectBlock={handleSelectBlock}
          onMoveBlock={handleMoveBlock}
          onDeleteBlock={handleDeleteBlock}
          onChangeTextBlockText={handleChangeTextBlockText}
          onUpdateBlockStyle={handleUpdateBlockStyle}
          onDeselectBlocks={handleDeselectBlocks}
          onReorderPages={handleReorderPages}
          onDeletePage={handleDeletePage}
          // Added Drawing and Structural callbacks:
          onRotatePage={handleRotatePage}
          onInsertBlankPage={handleInsertBlankPage}
          onInsertPdfDrop={handleInsertPdfDrop}
          onAddDrawingStroke={handleAddDrawingStroke}
          onDeleteDrawingStroke={handleDeleteDrawingStroke}
          onUpdateWatermark={handleUpdateWatermark}
          // History Undo / Redo callbacks:
          onUndo={handleUndo}
          onRedo={handleRedo}
          canUndo={historyIndex > 0}
          canRedo={historyIndex < history.length - 1}
        />
      )}

      {/* Loader Spinner Overlay */}
      <Loader visible={loading} title={loaderTitle} subtitle={loaderSubtitle} />

      {/* Toast Notification System */}
      <div id="toast-container" className="toast-container">
        {toasts.map((toast) => {
          const icon =
            toast.type === 'success'
              ? '✓'
              : toast.type === 'danger'
              ? '⚠'
              : 'i';
          return (
            <div key={toast.id} className={`toast toast-${toast.type}`}>
              <span className="toast-icon-symbol" style={{ fontWeight: 'bold', marginRight: '6px' }}>{icon}</span>
              <span className="toast-text">{toast.message}</span>
            </div>
          );
        })}
      </div>
    </>
  );
};

export default App;
