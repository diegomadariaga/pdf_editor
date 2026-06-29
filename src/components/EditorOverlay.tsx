import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { 
  X, Type, LayoutGrid, TypeOutline, Palette, Check, Download, 
  Undo2, Redo2, Pencil, Highlighter, Eraser, Stamp, MousePointer,
  CornerUpLeft, CornerUpRight, ZoomIn, ZoomOut
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import type { Document, DrawingStroke, Watermark } from '../types';
import { TextEditView } from './TextEditView';
import { OrganizeView } from './OrganizeView';
import { ThumbnailsSidebar } from './ThumbnailsSidebar';

interface EditorOverlayProps {
  doc: Document;
  editorMode: 'text' | 'organize';
  activeTextBlockId: string | null;
  pdfjsDoc: pdfjsLib.PDFDocumentProxy;
  onClose: () => void;
  onSave: () => void;
  onDownload: () => void;
  onSetMode: (mode: 'text' | 'organize') => void;
  onAddTextBlock: (pageId: string, xPercent: number, yPercent: number) => void;
  onSelectBlock: (id: string) => void;
  onMoveBlock: (id: string, x: number, y: number) => void;
  onDeleteBlock: (id: string) => void;
  onChangeTextBlockText: (id: string, text: string) => void;
  onUpdateBlockStyle: (id: string, style: { font?: 'Helvetica' | 'TimesNewRoman' | 'Courier'; fontSize?: number; color?: string }) => void;
  onDeselectBlocks: () => void;
  onReorderPages: (sortedPageIds: string[]) => void;
  onDeletePage: (pageId: string) => void;
  onRotatePage: (pageId: string, angleDelta: number) => void;
  onInsertBlankPage: (afterIndex: number) => void;
  onInsertPdfDrop: (afterIndex: number, file: File) => void;
  onAddDrawingStroke: (pageId: string, stroke: DrawingStroke) => void;
  onDeleteDrawingStroke: (pageId: string, strokeId: string) => void;
  onUpdateWatermark: (watermark: Watermark | undefined) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export const EditorOverlay: React.FC<EditorOverlayProps> = ({
  doc,
  editorMode,
  activeTextBlockId,
  pdfjsDoc,
  onClose,
  onSave,
  onDownload,
  onSetMode,
  onAddTextBlock,
  onSelectBlock,
  onMoveBlock,
  onDeleteBlock,
  onChangeTextBlockText,
  onUpdateBlockStyle,
  onDeselectBlocks,
  onReorderPages,
  onDeletePage,
  onRotatePage,
  onInsertBlankPage,
  onInsertPdfDrop,
  onAddDrawingStroke,
  onDeleteDrawingStroke,
  onUpdateWatermark,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}) => {
  const activeBlock = doc.textBlocks.find((b) => b.id === activeTextBlockId);
  const [zoomScale, setZoomScale] = useState<number>(1.0);

  // Visual/Drawing Editor Tools Local UI State
  const [toolMode, setToolMode] = useState<'select' | 'text' | 'draw' | 'highlight' | 'erase'>('select');
  const [drawColor, setDrawColor] = useState<string>('#ef4444'); // default red
  const [drawWidth, setDrawWidth] = useState<number>(3);
  const [showWatermarkPanel, setShowWatermarkPanel] = useState<boolean>(false);

  // Active page state for focused rotation
  const [activePageId, setActivePageId] = useState<string | null>(null);

  // Auto-select first page if none is active
  const currentActivePageId = doc.pages.some((p) => p.pageId === activePageId)
    ? activePageId
    : (doc.pages[0]?.pageId || null);

  // Track if scrolling is caused programmatically (via clicking a thumbnail)
  const isProgrammaticScrollRef = useRef<boolean>(false);
  const programmaticScrollTimeoutRef = useRef<number | null>(null);

  const handleSelectPage = (pageId: string) => {
    setActivePageId(pageId);
    
    // Disable scroll spy during smooth programmatic scroll to target page
    isProgrammaticScrollRef.current = true;
    if (programmaticScrollTimeoutRef.current) {
      window.clearTimeout(programmaticScrollTimeoutRef.current);
    }
    programmaticScrollTimeoutRef.current = window.setTimeout(() => {
      isProgrammaticScrollRef.current = false;
    }, 800);

    const element = document.getElementById(`page-wrapper-${pageId}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const editorContentRef = useRef<HTMLDivElement>(null);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (programmaticScrollTimeoutRef.current) {
        window.clearTimeout(programmaticScrollTimeoutRef.current);
      }
    };
  }, []);

  // Scroll spy effect: detect currently viewed page based on scroll position (50% visibility threshold)
  useEffect(() => {
    const container = editorContentRef.current;
    if (!container || editorMode !== 'text') return;

    const handleScroll = () => {
      if (isProgrammaticScrollRef.current) return;

      const containerRect = container.getBoundingClientRect();
      const containerHeight = containerRect.height;
      
      // The threshold line is at 50% height of the container's viewport
      const thresholdLine = containerRect.top + containerHeight * 0.5;

      let activePageIdCandidate: string | null = null;
      let minDistance = Infinity;

      for (const page of doc.pages) {
        const element = document.getElementById(`page-wrapper-${page.pageId}`);
        if (!element) continue;

        const rect = element.getBoundingClientRect();
        
        // If the page overlaps the threshold line (currently at 50% of the screen height)
        if (rect.top <= thresholdLine && rect.bottom >= thresholdLine) {
          activePageIdCandidate = page.pageId;
          break;
        }

        // Otherwise find the page whose center is closest to the middle of the viewport
        const pageMiddle = rect.top + rect.height / 2;
        const distance = Math.abs(pageMiddle - thresholdLine);
        if (distance < minDistance) {
          minDistance = distance;
          activePageIdCandidate = page.pageId;
        }
      }

      if (activePageIdCandidate && activePageIdCandidate !== currentActivePageId) {
        setActivePageId(activePageIdCandidate);
      }
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    // Run once on mount or when relevant parameters change
    handleScroll();

    return () => {
      container.removeEventListener('scroll', handleScroll);
    };
  }, [doc.pages, currentActivePageId, editorMode, zoomScale]);
  const zoomScaleRef = useRef(zoomScale);
  const zoomAnchorRef = useRef<{ x: number; y: number; vx: number; vy: number; oldScale: number } | null>(null);

  // Sync zoomScale to ref for scroll listener stability
  useEffect(() => {
    zoomScaleRef.current = zoomScale;
  }, [zoomScale]);

  const handleZoomChange = (nextScale: number, e?: MouseEvent | WheelEvent) => {
    if (!editorContentRef.current) return;
    const element = editorContentRef.current;
    const rect = element.getBoundingClientRect();

    let vx = rect.width / 2;
    let vy = rect.height / 2;

    if (e) {
      // Zoom focused on cursor if hovering a page wrapper, otherwise center of pages area
      const pageWrapper = (e.target as HTMLElement).closest('.page-wrapper');
      if (pageWrapper) {
        vx = e.clientX - rect.left;
        vy = e.clientY - rect.top;
      }
    }

    const sx = element.scrollLeft;
    const sy = element.scrollTop;
    const cx = sx + vx;
    const cy = sy + vy;

    zoomAnchorRef.current = {
      x: cx,
      y: cy,
      vx,
      vy,
      oldScale: zoomScaleRef.current,
    };

    setZoomScale(nextScale);
  };

  // Adjust scrolling post-render to lock the zoom anchor position in the viewport
  useLayoutEffect(() => {
    if (!zoomAnchorRef.current || !editorContentRef.current) return;
    const anchor = zoomAnchorRef.current;
    const element = editorContentRef.current;

    const ratio = zoomScale / anchor.oldScale;
    const nextScrollLeft = anchor.x * ratio - anchor.vx;
    const nextScrollTop = anchor.y * ratio - anchor.vy;

    element.scrollLeft = nextScrollLeft;
    element.scrollTop = nextScrollTop;

    zoomAnchorRef.current = null;
  }, [zoomScale]);

  // Wheel and pinch-to-zoom listener with prevention of browser zoom
  useEffect(() => {
    const element = editorContentRef.current;
    if (!element) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const direction = e.deltaY < 0 ? 1 : -1;
        const step = Math.min(0.08, Math.max(0.01, Math.abs(e.deltaY) * 0.003)) * direction;
        const nextScale = Math.max(0.5, Math.min(2.5, zoomScaleRef.current + step));
        handleZoomChange(Math.round(nextScale * 100) / 100, e);
      }
    };

    element.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      element.removeEventListener('wheel', handleWheel);
    };
  }, []);

  // Watermark Values derived directly from document
  const watermarkText = doc.watermark?.text || '';
  const watermarkColor = doc.watermark?.color || '#64748b';
  const watermarkOpacity = doc.watermark?.opacity || 0.15;
  const watermarkSize = doc.watermark?.fontSize || 50;

  // Keyboard shortcut listener for Undo/Redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMod = e.ctrlKey || e.metaKey;
      if (isMod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          if (canRedo) onRedo();
        } else {
          if (canUndo) onUndo();
        }
      } else if (isMod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        if (canRedo) onRedo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onUndo, onRedo, canUndo, canRedo]);

  const handleFontChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (!activeTextBlockId) return;
    onUpdateBlockStyle(activeTextBlockId, { font: e.target.value as 'Helvetica' | 'TimesNewRoman' | 'Courier' });
  };

  const handleSizeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!activeTextBlockId) return;
    const val = e.target.value;
    if (val === '') {
      onUpdateBlockStyle(activeTextBlockId, { fontSize: 0 });
    } else {
      const size = parseInt(val);
      if (!isNaN(size)) {
        onUpdateBlockStyle(activeTextBlockId, { fontSize: size });
      }
    }
  };

  const handleColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!activeTextBlockId) return;
    onUpdateBlockStyle(activeTextBlockId, { color: e.target.value });
  };

  const handleEditorOverlayClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.classList.contains('editor-content')) {
      onDeselectBlocks();
    }
  };

  // Watermark Change Handlers
  const handleWatermarkTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value;
    if (!text) {
      onUpdateWatermark(undefined);
    } else {
      onUpdateWatermark({
        text,
        color: watermarkColor,
        opacity: watermarkOpacity,
        fontSize: watermarkSize,
      });
    }
  };

  const handleWatermarkColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (watermarkText) {
      onUpdateWatermark({
        text: watermarkText,
        color: e.target.value,
        opacity: watermarkOpacity,
        fontSize: watermarkSize,
      });
    }
  };

  const handleWatermarkOpacityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const opacity = parseFloat(e.target.value);
    if (watermarkText) {
      onUpdateWatermark({
        text: watermarkText,
        color: watermarkColor,
        opacity,
        fontSize: watermarkSize,
      });
    }
  };

  const handleWatermarkSizeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fontSize = parseInt(e.target.value) || 30;
    if (watermarkText) {
      onUpdateWatermark({
        text: watermarkText,
        color: watermarkColor,
        opacity: watermarkOpacity,
        fontSize,
      });
    }
  };

  return (
    <div id="editor-overlay" className="editor-overlay">
      {/* Editor Header Toolbar */}
      <header className="editor-toolbar">
        <div className="toolbar-left">
          <button id="close-editor-btn" className="btn-icon" title="Cerrar y descartar" onClick={onClose}>
            <X size={20} />
          </button>
          
          <span className="toolbar-divider"></span>
          
          <button 
            className="btn-icon" 
            title="Deshacer (Ctrl+Z)" 
            onClick={onUndo} 
            disabled={!canUndo}
            style={{ opacity: canUndo ? 1 : 0.35, cursor: canUndo ? 'pointer' : 'not-allowed' }}
          >
            <Undo2 size={18} />
          </button>
          <button 
            className="btn-icon" 
            title="Rehacer (Ctrl+Y)" 
            onClick={onRedo} 
            disabled={!canRedo}
            style={{ opacity: canRedo ? 1 : 0.35, cursor: canRedo ? 'pointer' : 'not-allowed' }}
          >
            <Redo2 size={18} />
          </button>
          
          <span className="toolbar-divider"></span>
          <h2 id="editor-doc-title">{doc.name}.pdf</h2>
        </div>

        {/* View & Edit Mode Toggles */}
        <div className="toolbar-center">
          <div className="segmented-control">
            <button
              id="mode-text-btn"
              className={`segment-btn ${editorMode === 'text' ? 'active' : ''}`}
              title="Editar textos y trazos"
              onClick={() => onSetMode('text')}
            >
              <Type size={15} /> <span>Editar PDF</span>
            </button>
            <button
              id="mode-organize-btn"
              className={`segment-btn ${editorMode === 'organize' ? 'active' : ''}`}
              title="Organizar páginas"
              onClick={() => onSetMode('organize')}
            >
              <LayoutGrid size={15} /> <span>Organizar Páginas</span>
            </button>
          </div>
        </div>

        {/* Editor Actions */}
        <div className="toolbar-right">


          {/* Watermark toggle button */}
          <button
            className={`btn btn-secondary btn-small ${showWatermarkPanel ? 'active' : ''}`}
            title="Configurar Marca de Agua"
            onClick={() => setShowWatermarkPanel(!showWatermarkPanel)}
            style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem' }}
          >
            <Stamp size={14} /> Marca de Agua
          </button>

          <button id="download-editor-btn" className="btn btn-primary" onClick={onDownload} title="Descargar PDF editado">
            <Download size={16} /> Descargar PDF
          </button>

          <button id="save-editor-btn" className="btn btn-success" onClick={onSave}>
            <Check size={16} /> Guardar Cambios
          </button>
        </div>
      </header>

      {/* Unified Toolbar and Settings Bar */}
      {editorMode === 'text' && (
        <div className="sub-settings-bar" style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}>
          
          {/* Zoom Controls */}
          <div className="zoom-controls" style={{ display: 'flex', gap: '6px', alignItems: 'center', background: 'var(--bg-darker)', padding: '3px', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
            <button
              className="btn-icon"
              title="Alejar (Zoom Out)"
              onClick={() => handleZoomChange(Math.max(0.5, zoomScale - 0.1))}
              disabled={zoomScale <= 0.5}
              style={{ opacity: zoomScale <= 0.5 ? 0.35 : 1, cursor: zoomScale <= 0.5 ? 'not-allowed' : 'pointer' }}
            >
              <ZoomOut size={14} />
            </button>
            <span style={{ fontSize: '0.75rem', minWidth: '40px', textAlign: 'center', fontWeight: 'bold' }}>
              {Math.round(zoomScale * 100)}%
            </span>
            <button
              className="btn-icon"
              title="Acercar (Zoom In)"
              onClick={() => handleZoomChange(Math.min(2.5, zoomScale + 0.1))}
              disabled={zoomScale >= 2.5}
              style={{ opacity: zoomScale >= 2.5 ? 0.35 : 1, cursor: zoomScale >= 2.5 ? 'not-allowed' : 'pointer' }}
            >
              <ZoomIn size={14} />
            </button>
            <button
              className="btn btn-secondary btn-small"
              title="Restablecer (100%)"
              onClick={() => handleZoomChange(1.0)}
              style={{ padding: '0.2rem 0.4rem', fontSize: '0.7rem', height: '22px', display: 'flex', alignItems: 'center' }}
            >
              100%
            </button>
          </div>

          <span className="style-divider" style={{ margin: '0 4px' }}></span>

          {/* Tool Mode Selection Group */}
          <div className="tool-control-segmented" style={{ display: 'flex', gap: '4px', background: 'var(--bg-darker)', padding: '3px', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
            <button
              className={`btn-icon ${toolMode === 'select' ? 'active-tool' : ''}`}
              title="Seleccionar y mover (Flecha)"
              onClick={() => { setToolMode('select'); onDeselectBlocks(); }}
            >
              <MousePointer size={14} />
            </button>
            <button
              className={`btn-icon ${toolMode === 'text' ? 'active-tool' : ''}`}
              title="Escribir texto"
              onClick={() => { setToolMode('text'); onDeselectBlocks(); }}
            >
              <Type size={14} />
            </button>
            <button
              className={`btn-icon ${toolMode === 'draw' ? 'active-tool' : ''}`}
              title="Dibujo libre (Pincel)"
              onClick={() => { setToolMode('draw'); onDeselectBlocks(); }}
            >
              <Pencil size={14} />
            </button>
            <button
              className={`btn-icon ${toolMode === 'highlight' ? 'active-tool' : ''}`}
              title="Resaltador (Destacador)"
              onClick={() => { setToolMode('highlight'); onDeselectBlocks(); }}
            >
              <Highlighter size={14} />
            </button>
            <button
              className={`btn-icon ${toolMode === 'erase' ? 'active-tool' : ''}`}
              title="Borrador de trazos"
              onClick={() => { setToolMode('erase'); onDeselectBlocks(); }}
            >
              <Eraser size={14} />
            </button>
          </div>

          <span className="style-divider" style={{ margin: '0 4px' }}></span>

          {/* Active Page Rotation Controls */}
          <div className="page-rotation-controls-subbar" style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Girar página:</span>
            <button
              className="btn btn-secondary btn-small rotate-sub-btn"
              title="Rotar página activa 90° izquierda"
              onClick={() => {
                if (currentActivePageId) {
                  onRotatePage(currentActivePageId, -90);
                }
              }}
              style={{ padding: '0.35rem 0.5rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
            >
              <CornerUpLeft size={13} />
              <span style={{ fontSize: '0.75rem' }}>-90°</span>
            </button>
            <button
              className="btn btn-secondary btn-small rotate-sub-btn"
              title="Rotar página activa 90° derecha"
              onClick={() => {
                if (currentActivePageId) {
                  onRotatePage(currentActivePageId, 90);
                }
              }}
              style={{ padding: '0.35rem 0.5rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
            >
              <CornerUpRight size={13} />
              <span style={{ fontSize: '0.75rem' }}>+90°</span>
            </button>
          </div>

          {/* Render active tool settings if applicable */}
          {((toolMode === 'text' && activeBlock) || toolMode === 'draw' || toolMode === 'highlight' || toolMode === 'erase') && (
            <>
              <span className="style-divider" style={{ margin: '0 4px' }}></span>
              
              {toolMode === 'text' && activeBlock && (
                <div id="style-bar" className="style-bar" style={{ margin: 0, border: 'none', background: 'transparent', padding: 0 }}>
                  <div className="style-control">
                    <Type className="style-icon" size={14} />
                    <select id="text-font" value={activeBlock.font} onChange={handleFontChange}>
                      <option value="Helvetica">Helvetica</option>
                      <option value="TimesNewRoman">Times Roman</option>
                      <option value="Courier">Courier</option>
                    </select>
                  </div>
                  <span className="style-divider"></span>
                  <div className="style-control">
                    <TypeOutline className="style-icon" size={14} />
                    <input
                      type="number"
                      id="text-size"
                      min="8"
                      max="72"
                      value={activeBlock.fontSize || ''}
                      onChange={handleSizeChange}
                    />
                    <span className="unit">px</span>
                  </div>
                  <span className="style-divider"></span>
                  <div className="style-control">
                    <Palette className="style-icon" size={14} />
                    <input
                      type="color"
                      id="text-color"
                      value={activeBlock.color}
                      onChange={handleColorChange}
                    />
                  </div>
                </div>
              )}

              {toolMode === 'draw' && (
                <div className="style-bar" style={{ margin: 0, border: 'none', background: 'transparent', padding: 0 }}>
                  <span className="style-title">Pincel:</span>
                  <div className="style-control">
                    <Palette className="style-icon" size={14} />
                    <input
                      type="color"
                      value={drawColor}
                      onChange={(e) => setDrawColor(e.target.value)}
                    />
                  </div>
                  <span className="style-divider"></span>
                  <div className="style-control">
                    <span className="unit">Grosor:</span>
                    <input
                      type="range"
                      min="1"
                      max="20"
                      value={drawWidth}
                      onChange={(e) => setDrawWidth(parseInt(e.target.value))}
                      style={{ width: '80px' }}
                    />
                    <span className="unit">{drawWidth}px</span>
                  </div>
                </div>
              )}

              {toolMode === 'highlight' && (
                <div className="style-bar" style={{ margin: 0, border: 'none', background: 'transparent', padding: 0 }}>
                  <span className="style-title">Resaltador:</span>
                  <span className="unit" style={{ color: '#fbbf24', fontWeight: 'bold' }}>Amarillo</span>
                  <span className="style-divider"></span>
                  <div className="style-control">
                    <span className="unit">Grosor:</span>
                    <input
                      type="range"
                      min="10"
                      max="50"
                      value={drawWidth < 10 ? 25 : drawWidth}
                      onChange={(e) => setDrawWidth(parseInt(e.target.value))}
                      style={{ width: '80px' }}
                    />
                    <span className="unit">{drawWidth < 10 ? 25 : drawWidth}px</span>
                  </div>
                </div>
              )}

              {toolMode === 'erase' && (
                <div className="style-bar" style={{ margin: 0, border: 'none', background: 'transparent', padding: 0 }}>
                  <span className="style-title" style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Haz clic o arrastra sobre los trazos para eliminarlos.</span>
                </div>
              )}
            </>
          )}

        </div>
      )}

      {/* Watermark Configuration Side Panel / Floating Box */}
      {showWatermarkPanel && (
        <div className="watermark-config-panel">
          <div className="panel-header">
            <h4>Configurar Marca de Agua</h4>
            <button className="btn-close-panel" onClick={() => setShowWatermarkPanel(false)}>&times;</button>
          </div>
          <div className="panel-body">
            <div className="panel-control">
              <label>Texto de la marca:</label>
              <input
                type="text"
                placeholder="Ej. CONFIDENCIAL, COPIA, etc."
                value={watermarkText}
                onChange={handleWatermarkTextChange}
              />
            </div>
            <div className="panel-control">
              <label>Color:</label>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input
                  type="color"
                  value={watermarkColor}
                  onChange={handleWatermarkColorChange}
                  disabled={!watermarkText}
                />
                <span className="unit">Personalizar</span>
              </div>
            </div>
            <div className="panel-control">
              <label>Transparencia: {(watermarkOpacity * 100).toFixed(0)}%</label>
              <input
                type="range"
                min="0.05"
                max="0.6"
                step="0.05"
                value={watermarkOpacity}
                onChange={handleWatermarkOpacityChange}
                disabled={!watermarkText}
              />
            </div>
            <div className="panel-control">
              <label>Tamaño de Letra: {watermarkSize}px</label>
              <input
                type="range"
                min="20"
                max="100"
                step="5"
                value={watermarkSize}
                onChange={handleWatermarkSizeChange}
                disabled={!watermarkText}
              />
            </div>
            {!watermarkText && (
              <span className="panel-tip">Escribe texto arriba para aplicar la marca en diagonal en todas las páginas.</span>
            )}
          </div>
        </div>
      )}

      {/* Editor Workspace Areas */}
      <div className="editor-body-container" style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
        {editorMode === 'text' && (
          <ThumbnailsSidebar
            pages={doc.pages}
            pdfjsDoc={pdfjsDoc}
            activePageId={currentActivePageId}
            onSelectPage={handleSelectPage}
          />
        )}
        <div ref={editorContentRef} className="editor-content" onClick={handleEditorOverlayClick}>
          {editorMode === 'text' ? (
            <TextEditView
              pages={doc.pages}
              pdfjsDoc={pdfjsDoc}
              textBlocks={doc.textBlocks}
              drawings={doc.drawings || []}
              watermark={doc.watermark}
              activeTextBlockId={activeTextBlockId}
              renderScale={zoomScale}
              onAddText={onAddTextBlock}
              onSelectBlock={onSelectBlock}
              onMoveBlock={onMoveBlock}
              onDeleteBlock={onDeleteBlock}
              onChangeTextBlockText={onChangeTextBlockText}
              onDeselectBlocks={onDeselectBlocks}
              // Add drawing/highlighter props:
              toolMode={toolMode}
              drawColor={toolMode === 'highlight' ? '#ffff00' : drawColor}
              drawWidth={toolMode === 'highlight' && drawWidth < 10 ? 25 : drawWidth}
              onAddDrawingStroke={onAddDrawingStroke}
              onDeleteDrawingStroke={onDeleteDrawingStroke}
              onDeletePage={onDeletePage}
              activePageId={currentActivePageId}
              onFocusPage={setActivePageId}
            />
          ) : (
            <OrganizeView
              pages={doc.pages}
              pdfjsDoc={pdfjsDoc}
              onReorderPages={onReorderPages}
              onDeletePage={onDeletePage}
              onRotatePage={onRotatePage}
              onInsertBlankPage={onInsertBlankPage}
              onInsertPdfDrop={onInsertPdfDrop}
            />
          )}
        </div>
      </div>
    </div>
  );
};
