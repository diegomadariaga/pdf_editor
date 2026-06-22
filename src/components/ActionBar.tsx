import React, { useState } from 'react';
import { GitMerge, Download } from 'lucide-react';

interface ActionBarProps {
  docCount: number;
  onMerge: (filename: string) => void;
}

export const ActionBar: React.FC<ActionBarProps> = ({ docCount, onMerge }) => {
  const [filename, setFilename] = useState('combinado');

  if (docCount < 2) return null;

  const handleMergeClick = () => {
    let finalName = filename.trim();
    if (!finalName) finalName = 'combinado';
    if (!finalName.toLowerCase().endsWith('.pdf')) {
      finalName += '.pdf';
    }
    onMerge(finalName);
  };

  return (
    <footer id="action-bar" className="action-bar">
      <div className="action-bar-container">
        <div className="merge-info">
          <GitMerge className="merge-icon" size={32} />
          <div>
            <h4>Combinar Documentos</h4>
            <p id="merge-summary">Listo para unir {docCount} archivos en un solo PDF</p>
          </div>
        </div>
        <div className="merge-actions">
          <div className="input-wrapper">
            <input
              type="text"
              id="merged-filename"
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              placeholder="Nombre del archivo final"
            />
            <span className="extension">.pdf</span>
          </div>
          <button id="merge-download-btn" className="btn btn-primary" onClick={handleMergeClick}>
            <Download size={16} /> Unir y Descargar
          </button>
        </div>
      </div>
    </footer>
  );
};
