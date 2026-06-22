import React, { useRef, useState } from 'react';
import { UploadCloud } from 'lucide-react';

interface DropzoneProps {
  onFilesSelect: (files: FileList | File[]) => void;
}

export const Dropzone: React.FC<DropzoneProps> = ({ onFilesSelect }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      onFilesSelect(e.dataTransfer.files);
    }
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFilesSelect(e.target.files);
    }
  };

  return (
    <section className="dropzone-section">
      <div
        id="dropzone"
        className={`dropzone ${isDragOver ? 'dragover' : ''}`}
        onClick={handleClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input
          type="file"
          id="file-input"
          ref={fileInputRef}
          multiple
          accept=".pdf"
          className="hidden-file-input"
          onChange={handleChange}
        />
        <div className="dropzone-content">
          <div className="icon-pulse">
            <UploadCloud className="upload-icon" size={38} />
          </div>
          <h3>Arrastra tus archivos PDF aquí</h3>
          <p>o haz clic para explorar en tu computadora</p>
          <span className="badge">Solo archivos .pdf</span>
        </div>
      </div>
    </section>
  );
};
