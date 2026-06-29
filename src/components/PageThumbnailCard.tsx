import React, { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { CornerUpRight, CornerUpLeft, Trash2, FileUp } from 'lucide-react';
import type { Page } from '../types';
import { getCachedPdfjsDoc } from '../utils/pdfCache';

interface PageThumbnailCardProps {
  page: Page;
  index: number;
  pdfjsDoc: pdfjsLib.PDFDocumentProxy;
  onDeletePage: (pageId: string) => void;
  onRotatePage: (pageId: string, angleDelta: number) => void;
  onInsertPdfDrop?: (afterIndex: number, file: File) => void;
}

const PageThumbnailCardComponent: React.FC<PageThumbnailCardProps> = ({
  page,
  index,
  pdfjsDoc,
  onDeletePage,
  onRotatePage,
  onInsertPdfDrop,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  useEffect(() => {
    let active = true;
    let renderTask: pdfjsLib.RenderTask | null = null;
    const renderPageThumb = async () => {
      try {
        if (!canvasRef.current || !active) return;
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');
        if (!context) return;

        if (page.isBlank) {
          canvas.width = 110;
          canvas.height = 150;
          context.fillStyle = '#ffffff';
          context.fillRect(0, 0, canvas.width, canvas.height);
          
          // Draw standard visual indicator for blank page
          context.fillStyle = '#64748b';
          context.font = '10px sans-serif';
          context.textAlign = 'center';
          context.fillText('Página en Blanco', canvas.width / 2, canvas.height / 2);
          return;
        }

        let pdfPage;
        if (page.externalBytes) {
          const extPdfDoc = await getCachedPdfjsDoc(page.externalBytes);
          pdfPage = await extPdfDoc.getPage((page.externalOriginalIndex ?? 0) + 1);
        } else {
          pdfPage = await pdfjsDoc.getPage(page.originalIndex + 1);
        }
        
        if (!active || !canvasRef.current) return;

        const initialViewport = pdfPage.getViewport({ scale: 1.0 });
        const scale = 150 / initialViewport.height;
        const rotationAngle = (pdfPage.rotate + (page.rotation || 0)) % 360;
        const viewport = pdfPage.getViewport({ scale, rotation: rotationAngle });

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        renderTask = pdfPage.render({ canvasContext: context, viewport, canvas });
        await renderTask.promise;
      } catch (err) {
        const error = err as { name?: string };
        if (error.name !== 'RenderingCancelledException') {
          console.error("Error rendering page thumbnail in organizer:", err);
        }
      }
    };

    renderPageThumb();

    return () => {
      active = false;
      if (renderTask) {
        renderTask.cancel();
      }
    };
  }, [page, pdfjsDoc]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragOver(true);
    }
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.name.toLowerCase().endsWith('.pdf') && onInsertPdfDrop) {
        onInsertPdfDrop(index, file);
      }
    }
  };

  return (
    <div 
      className={`page-thumbnail-card ${isDragOver ? 'drag-over-active' : ''}`} 
      data-page-id={page.pageId}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragOver && (
        <div className="drop-indicator-overlay">
          <FileUp size={24} className="drop-icon" />
          <span>Soltar PDF para insertar aquí</span>
        </div>
      )}

      <button
        className="page-delete-btn"
        title="Eliminar página"
        onClick={() => onDeletePage(page.pageId)}
      >
        <Trash2 size={12} />
      </button>

      <div className="page-thumb-wrapper">
        <canvas ref={canvasRef} className="page-thumb-canvas"></canvas>
      </div>

      <div className="page-card-controls">
        <span className="page-number-label">Pág. {index + 1}</span>
        <div className="page-rotation-controls">
          <button
            className="btn-rotate"
            title="Rotar 90° izquierda"
            onClick={() => onRotatePage(page.pageId, -90)}
          >
            <CornerUpLeft size={11} />
          </button>
          <button
            className="btn-rotate"
            title="Rotar 90° derecha"
            onClick={() => onRotatePage(page.pageId, 90)}
          >
            <CornerUpRight size={11} />
          </button>
        </div>
      </div>
    </div>
  );
};

export const PageThumbnailCard = React.memo(PageThumbnailCardComponent, (prev, next) => {
  return (
    prev.index === next.index &&
    prev.pdfjsDoc === next.pdfjsDoc &&
    prev.page.pageId === next.page.pageId &&
    prev.page.rotation === next.page.rotation &&
    prev.page.isBlank === next.page.isBlank &&
    prev.page.externalOriginalIndex === next.page.externalOriginalIndex &&
    prev.page.externalBytes === next.page.externalBytes
  );
});
