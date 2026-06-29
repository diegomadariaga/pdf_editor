import React, { useEffect, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import type { Page } from '../types';
import { getCachedPdfjsDoc } from '../utils/pdfCache';

interface ThumbnailsSidebarProps {
  pages: Page[];
  pdfjsDoc: pdfjsLib.PDFDocumentProxy;
  activePageId: string | null;
  onSelectPage: (pageId: string) => void;
}

const ThumbnailsSidebarComponent: React.FC<ThumbnailsSidebarProps> = ({
  pages,
  pdfjsDoc,
  activePageId,
  onSelectPage,
}) => {
  return (
    <div className="editor-thumbnails-sidebar">
      <div className="sidebar-header">
        <h4>Páginas</h4>
      </div>
      <div className="sidebar-list">
        {pages.map((page, index) => (
          <ThumbnailItem
            key={page.pageId}
            page={page}
            index={index}
            pdfjsDoc={pdfjsDoc}
            isActive={page.pageId === activePageId}
            onClick={() => onSelectPage(page.pageId)}
          />
        ))}
      </div>
    </div>
  );
};

export const ThumbnailsSidebar = React.memo(ThumbnailsSidebarComponent);

interface ThumbnailItemProps {
  page: Page;
  index: number;
  pdfjsDoc: pdfjsLib.PDFDocumentProxy;
  isActive: boolean;
  onClick: () => void;
}

const ThumbnailItemComponent: React.FC<ThumbnailItemProps> = ({
  page,
  index,
  pdfjsDoc,
  isActive,
  onClick,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll this thumbnail into view when it becomes active
  useEffect(() => {
    if (isActive && containerRef.current) {
      containerRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [isActive]);

  useEffect(() => {
    let active = true;
    let renderTask: pdfjsLib.RenderTask | null = null;
    const renderThumb = async () => {
      try {
        if (!canvasRef.current || !active) return;
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');
        if (!context) return;

        if (page.isBlank) {
          canvas.width = 85;
          canvas.height = 120;
          context.fillStyle = '#ffffff';
          context.fillRect(0, 0, canvas.width, canvas.height);
          
          context.fillStyle = '#64748b';
          context.font = 'bold 9px sans-serif';
          context.textAlign = 'center';
          context.fillText('Blanco', canvas.width / 2, canvas.height / 2);
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
        const targetHeight = 110;
        const scale = targetHeight / initialViewport.height;
        const rotationAngle = (pdfPage.rotate + (page.rotation || 0)) % 360;
        const viewport = pdfPage.getViewport({ scale, rotation: rotationAngle });

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        renderTask = pdfPage.render({ canvasContext: context, viewport, canvas });
        await renderTask.promise;
      } catch (err) {
        const error = err as { name?: string };
        if (error.name !== 'RenderingCancelledException') {
          console.error("Error rendering thumbnail sidebar item:", err);
        }
      }
    };

    renderThumb();
    return () => {
      active = false;
      if (renderTask) {
        renderTask.cancel();
      }
    };
  }, [page, pdfjsDoc]);

  return (
    <div
      ref={containerRef}
      className={`sidebar-thumb-item ${isActive ? 'active' : ''}`}
      onClick={onClick}
    >
      <div className="thumb-canvas-wrapper">
        <canvas ref={canvasRef} />
      </div>
      <span className="thumb-page-number">Pág. {index + 1}</span>
    </div>
  );
};

const ThumbnailItem = React.memo(ThumbnailItemComponent, (prev, next) => {
  return (
    prev.index === next.index &&
    prev.isActive === next.isActive &&
    prev.pdfjsDoc === next.pdfjsDoc &&
    prev.page.pageId === next.page.pageId &&
    prev.page.rotation === next.page.rotation &&
    prev.page.isBlank === next.page.isBlank &&
    prev.page.externalOriginalIndex === next.page.externalOriginalIndex &&
    prev.page.externalBytes === next.page.externalBytes
  );
});
