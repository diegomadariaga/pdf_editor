import React, { useEffect, useRef, useState } from 'react';
import { Info, Plus, FileUp } from 'lucide-react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import Sortable from 'sortablejs';
import type { Page } from '../types';
import { PageThumbnailCard } from './PageThumbnailCard';

interface OrganizeViewProps {
  pages: Page[];
  pdfjsDoc: PDFDocumentProxy;
  onReorderPages: (sortedPageIds: string[]) => void;
  onDeletePage: (pageId: string) => void;
  onRotatePage: (pageId: string, angleDelta: number) => void;
  onInsertBlankPage: (afterIndex: number) => void;
  onInsertPdfDrop: (afterIndex: number, file: File) => void;
}

export const OrganizeView: React.FC<OrganizeViewProps> = ({
  pages,
  pdfjsDoc,
  onReorderPages,
  onDeletePage,
  onRotatePage,
  onInsertBlankPage,
  onInsertPdfDrop,
}) => {
  const gridRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [insertAfterIndex, setInsertAfterIndex] = useState<number>(-1);

  useEffect(() => {
    if (!gridRef.current || pages.length === 0) return;

    // Set up drag and drop sorting on wrappers
    const sortable = new Sortable(gridRef.current, {
      animation: 200,
      draggable: '.organize-card-wrapper',
      ghostClass: 'sortable-ghost',
      chosenClass: 'sortable-chosen',
      onEnd: () => {
        if (!gridRef.current) return;
        const cards = Array.from(gridRef.current.querySelectorAll('.page-thumbnail-card')) as HTMLElement[];
        const sortedPageIds = cards.map((card) => card.dataset.pageId || '');
        setTimeout(() => {
          onReorderPages(sortedPageIds);
        }, 50);
      },
    });

    return () => {
      sortable.destroy();
    };
  }, [pages, onReorderPages]);

  const handleInsertPdfClick = (afterIndex: number) => {
    setInsertAfterIndex(afterIndex);
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.name.toLowerCase().endsWith('.pdf')) {
        onInsertPdfDrop(insertAfterIndex, file);
      }
    }
    e.target.value = ''; // reset so the same file can be uploaded again
  };

  return (
    <div id="organize-container" className="organize-container organize-mode-view">
      <div className="organize-intro">
        <p>
          <Info size={18} style={{ marginRight: '6.5px', verticalAlign: 'middle' }} /> Arrastra las páginas para cambiar el orden, elimínalas o inserta hojas nuevas en blanco o de otros archivos PDF.
        </p>
      </div>

      {/* Hidden file input for inline PDF insertion */}
      <input
        type="file"
        ref={fileInputRef}
        accept=".pdf"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      <div ref={gridRef} id="organize-grid" className="organize-grid">
        {/* Insert at the very start of the document */}
        <div className="organize-insert-start-container">
          <span>Insertar al inicio:</span>
          <button
            className="btn-insert-inline"
            title="Insertar página en blanco al inicio"
            onClick={() => onInsertBlankPage(-1)}
          >
            <Plus size={12} /> + Blanco
          </button>
          <button
            className="btn-insert-inline"
            title="Insertar PDF al inicio"
            onClick={() => handleInsertPdfClick(-1)}
          >
            <FileUp size={12} /> + PDF
          </button>
        </div>

        {pages.map((page, index) => (
          <div key={page.pageId} className="organize-card-wrapper">
            <PageThumbnailCard
              page={page}
              index={index}
              pdfjsDoc={pdfjsDoc}
              onDeletePage={onDeletePage}
              onRotatePage={onRotatePage}
              onInsertPdfDrop={onInsertPdfDrop}
            />
            <div className="organize-insert-after">
              <button
                className="btn-insert-inline"
                title="Insertar página en blanco después"
                onClick={() => onInsertBlankPage(index)}
              >
                <Plus size={10} /> Blanco
              </button>
              <button
                className="btn-insert-inline"
                title="Insertar PDF después"
                onClick={() => handleInsertPdfClick(index)}
              >
                <FileUp size={10} /> PDF
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
