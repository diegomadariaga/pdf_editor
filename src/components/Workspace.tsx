import React, { useEffect, useRef } from 'react';
import { FolderOpen, PlusCircle } from 'lucide-react';
import Sortable from 'sortablejs';
import type { Document } from '../types';
import { Dropzone } from './Dropzone';
import { FileCard } from './FileCard';
import { ActionBar } from './ActionBar';

interface WorkspaceProps {
  documents: Document[];
  onFilesSelect: (files: FileList | File[]) => void;
  onGenerateSample: () => void;
  onRename: (id: string, newName: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onReorder: (sortedIds: string[]) => void;
  onMerge: (filename: string) => void;
  onDownload: (doc: Document) => void;
}

const WorkspaceComponent: React.FC<WorkspaceProps> = ({
  documents,
  onFilesSelect,
  onGenerateSample,
  onRename,
  onEdit,
  onDelete,
  onReorder,
  onMerge,
  onDownload,
}) => {
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!gridRef.current || documents.length === 0) return;

    const sortable = new Sortable(gridRef.current, {
      animation: 200,
      ghostClass: 'sortable-ghost',
      chosenClass: 'sortable-chosen',
      onEnd: () => {
        if (!gridRef.current) return;
        const cards = Array.from(gridRef.current.querySelectorAll('.file-card')) as HTMLElement[];
        const sortedIds = cards.map((card) => card.dataset.id || '');
        setTimeout(() => {
          onReorder(sortedIds);
        }, 50);
      },
    });

    return () => {
      sortable.destroy();
    };
  }, [documents, onReorder]);

  return (
    <main className="workspace-container">
      {/* US 1.1: Drag & Drop Dropzone */}
      <Dropzone onFilesSelect={onFilesSelect} />

      {/* Workspace Files Section */}
      <section className="files-section">
        <div className="section-header">
          <h2>Mesa de Trabajo</h2>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <button
              id="header-generate-sample-btn"
              className="btn btn-secondary btn-small"
              title="Crear PDF de prueba"
              onClick={onGenerateSample}
            >
              <PlusCircle size={14} /> + PDF de Prueba
            </button>
            <span id="file-count" className="file-count-badge">
              {documents.length} archivo(s)
            </span>
          </div>
        </div>

        {documents.length === 0 ? (
          /* Empty State */
          <div id="empty-state" className="empty-state">
            <FolderOpen className="empty-icon" size={48} />
            <p>Tu mesa de trabajo está vacía. Sube PDFs para comenzar a editarlos o combinarlos.</p>
            <button
              id="generate-sample-btn"
              className="btn btn-secondary btn-small"
              onClick={onGenerateSample}
            >
              <PlusCircle size={14} /> Crear PDF de Prueba
            </button>
          </div>
        ) : (
          /* US 1.2: Visual Cards Grid */
          <div ref={gridRef} id="files-grid" className="files-grid">
            {documents.map((doc) => (
              <FileCard
                key={doc.id}
                doc={doc}
                onRename={onRename}
                onEdit={onEdit}
                onDelete={onDelete}
                onDownload={onDownload}
              />
            ))}
          </div>
        )}
      </section>

      {/* Floating Bottom Action Bar */}
      <ActionBar docCount={documents.length} onMerge={onMerge} />
    </main>
  );
};

export const Workspace = React.memo(WorkspaceComponent);
