import React, { useEffect, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import type { Page } from '../types';

interface ThumbnailsSidebarProps {
  pages: Page[];
  pdfjsDoc: pdfjsLib.PDFDocumentProxy;
  activePageId: string | null;
  onSelectPage: (pageId: string) => void;
}

export const ThumbnailsSidebar: React.FC<ThumbnailsSidebarProps> = ({
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

interface ThumbnailItemProps {
  page: Page;
  index: number;
  pdfjsDoc: pdfjsLib.PDFDocumentProxy;
  isActive: boolean;
  onClick: () => void;
}

const ThumbnailItem: React.FC<ThumbnailItemProps> = ({
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
          const extPdfDoc = await pdfjsLib.getDocument({
            data: page.externalBytes,
            cMapUrl: `${window.location.origin}/cmaps/`,
            cMapPacked: true,
            standardFontDataUrl: `${window.location.origin}/standard_fonts/`,
            wasmUrl: `${window.location.origin}/wasm/`,
          }).promise;
          pdfPage = await extPdfDoc.getPage((page.externalOriginalIndex ?? 0) + 1);
        } else {
          pdfPage = await pdfjsDoc.getPage(page.originalIndex + 1);
        }

        const initialViewport = pdfPage.getViewport({ scale: 1.0 });
        const targetHeight = 110;
        const scale = targetHeight / initialViewport.height;
        const rotationAngle = (pdfPage.rotate + (page.rotation || 0)) % 360;
        const viewport = pdfPage.getViewport({ scale, rotation: rotationAngle });

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        await pdfPage.render({ canvasContext: context, viewport, canvas }).promise;
      } catch (err) {
        console.error("Error rendering thumbnail sidebar item:", err);
      }
    };

    renderThumb();
    return () => {
      active = false;
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
