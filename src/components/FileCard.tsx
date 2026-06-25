import React, { useEffect, useRef } from 'react';
import { Edit3, Trash2, GripVertical, Download } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import type { Document } from '../types';

interface FileCardProps {
  doc: Document;
  onRename: (id: string, newName: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onDownload: (doc: Document) => void;
}

export const FileCard: React.FC<FileCardProps> = ({ doc, onRename, onEdit, onDelete, onDownload }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let active = true;
    const renderThumb = async () => {
      try {
        // Slice rawBytes copy to avoid detaching in worker threads
        const pdf = await pdfjsLib.getDocument({
          data: doc.rawBytes.slice(),
          cMapUrl: `${window.location.origin}/cmaps/`,
          cMapPacked: true,
          standardFontDataUrl: `${window.location.origin}/standard_fonts/`,
          wasmUrl: `${window.location.origin}/wasm/`,
        }).promise;
        const page = await pdf.getPage(1);
        
        const initialViewport = page.getViewport({ scale: 1.0 });
        const scale = 180 / initialViewport.height;
        const viewport = page.getViewport({ scale });
        
        if (!canvasRef.current || !active) return;
        
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');
        if (!context) return;
        
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        
        await page.render({ canvasContext: context, viewport, canvas }).promise;
      } catch (err) {
        console.error("Error rendering thumbnail canvas in React:", err);
      }
    };
    
    renderThumb();
    
    return () => {
      active = false;
    };
  }, [doc.rawBytes]);

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onRename(doc.id, e.target.value);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur();
    }
  };

  return (
    <div className="file-card" data-id={doc.id}>
      <div className="card-thumb-container">
        <canvas ref={canvasRef} className="card-canvas"></canvas>
        <span className="card-pages-tag">{doc.pages.length} pág.</span>
        {doc.textBlocks.length > 0 && (
          <div className="card-meta-tag">
            <Edit3 size={12} /> Con Textos ({doc.textBlocks.length})
          </div>
        )}
        <div className="card-drag-indicator">
          <GripVertical size={20} />
        </div>
      </div>
      <div className="card-body" onClick={(e) => e.stopPropagation()}>
        <div className="card-title-container">
          <input
            type="text"
            className="card-title-input"
            value={doc.name}
            onChange={handleTitleChange}
            onKeyDown={handleKeyDown}
            title="Haz clic para renombrar"
          />
          <span className="card-title-ext">.pdf</span>
        </div>
        <div className="card-actions">
          <button className="btn btn-secondary btn-small edit-doc-btn" onClick={() => onEdit(doc.id)}>
            <Edit3 size={14} /> Editar
          </button>

          <button className="btn btn-primary btn-small download-doc-btn" title="Descargar PDF" onClick={() => onDownload(doc)}>
            <Download size={14} /> Descargar
          </button>
          <button className="btn btn-icon-danger delete-doc-btn" title="Eliminar archivo" onClick={() => onDelete(doc.id)} style={{ flex: 'none', width: '32px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};
