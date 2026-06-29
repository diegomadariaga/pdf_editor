import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import type { Page, TextBlock as TextBlockType, DrawingStroke, Watermark } from '../types';
import { TextBlock } from './TextBlock';

interface PageWrapperProps {
  page: Page;
  index: number;
  pdfjsDoc: pdfjsLib.PDFDocumentProxy;
  textBlocks: TextBlockType[];
  drawings: DrawingStroke[];
  watermark?: Watermark;
  activeTextBlockId: string | null;
  renderScale: number;
  onAddText: (pageId: string, xPercent: number, yPercent: number) => void;
  onSelectBlock: (id: string) => void;
  onMoveBlock: (id: string, x: number, y: number) => void;
  onDeleteBlock: (id: string) => void;
  onChangeTextBlockText: (id: string, text: string) => void;
  onDeselectBlocks: () => void;
  toolMode: 'select' | 'text' | 'draw' | 'highlight' | 'erase';
  drawColor: string;
  drawWidth: number;
  onAddDrawingStroke: (pageId: string, stroke: DrawingStroke) => void;
  onDeleteDrawingStroke: (pageId: string, strokeId: string) => void;
  onDeletePage: (pageId: string) => void;
  activePageId: string | null;
  onFocusPage: (pageId: string) => void;
  onHoverCoords?: (coords: { x: number; y: number; width: number; height: number; pageIndex: number } | null) => void;
}

export const PageWrapper: React.FC<PageWrapperProps> = ({
  page,
  index,
  pdfjsDoc,
  textBlocks,
  drawings,
  watermark,
  activeTextBlockId,
  renderScale,
  onAddText,
  onSelectBlock,
  onMoveBlock,
  onDeleteBlock,
  onChangeTextBlockText,
  onDeselectBlocks,
  toolMode,
  drawColor,
  drawWidth,
  onAddDrawingStroke,
  onDeleteDrawingStroke,
  onDeletePage,
  activePageId,
  onFocusPage,
  onHoverCoords,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [intrinsicSize, setIntrinsicSize] = useState<{ width: number; height: number } | null>(null);
  const [debouncedScale, setDebouncedScale] = useState(renderScale);
  const debouncedScaleRef = useRef(debouncedScale);

  // Sync debouncedScale to ref to keep dependencies clean in the render effect
  useEffect(() => {
    debouncedScaleRef.current = debouncedScale;
  }, [debouncedScale]);

  // Debounce the scale update to prevent heavy canvas re-rendering lag
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedScale(renderScale);
    }, 200); // 200ms debounce
    return () => clearTimeout(handler);
  }, [renderScale]);

  // Load intrinsic page dimensions at scale 1.0 (rotation-aware)
  useEffect(() => {
    let active = true;
    const loadIntrinsic = async () => {
      try {
        if (page.isBlank) {
          if (active) {
            setIntrinsicSize({ width: 595.28, height: 841.89 });
          }
          return;
        }

        let pageDoc = pdfjsDoc;
        let idxOffset = page.originalIndex + 1;

        if (page.externalBytes) {
          const extPdf = await pdfjsLib.getDocument({
            data: page.externalBytes,
            cMapUrl: `${window.location.origin}/cmaps/`,
            cMapPacked: true,
            standardFontDataUrl: `${window.location.origin}/standard_fonts/`,
            wasmUrl: `${window.location.origin}/wasm/`,
          }).promise;
          pageDoc = extPdf;
          idxOffset = (page.externalOriginalIndex ?? 0) + 1;
        }

        const pdfjsPage = await pageDoc.getPage(idxOffset);
        const rotationAngle = (pdfjsPage.rotate + (page.rotation || 0)) % 360;
        const viewport = pdfjsPage.getViewport({ scale: 1.0, rotation: rotationAngle });
        if (active) {
          setIntrinsicSize({ width: viewport.width, height: viewport.height });
        }
      } catch (err) {
        console.error("Error loading intrinsic dimensions:", err);
      }
    };
    loadIntrinsic();
    return () => {
      active = false;
    };
  }, [page, pdfjsDoc]);

  // Deriving canvas resolution dimensions synchronously during render using useMemo
  // Triggers React DOM canvas width/height updates before useEffect fires
  const dimensions = useMemo(() => {
    return intrinsicSize
      ? {
          width: intrinsicSize.width * debouncedScale,
          height: intrinsicSize.height * debouncedScale,
        }
      : null;
  }, [intrinsicSize, debouncedScale]);

  // Render PDF page content. It depends strictly on dimensions state, ensuring rendering
  // only happens AFTER React has updated the canvas width/height properties in the DOM.
  useEffect(() => {
    if (!dimensions || !canvasRef.current) return;
    let active = true;
    let renderTask: pdfjsLib.RenderTask | null = null;

    const renderPage = async () => {
      try {
        const canvas = canvasRef.current;
        if (!canvas || !active) return;
        const context = canvas.getContext('2d');
        if (!context || !active) return;

        if (page.isBlank) {
          context.fillStyle = '#ffffff';
          context.fillRect(0, 0, dimensions.width, dimensions.height);
          return;
        }

        let pageDoc = pdfjsDoc;
        let idxOffset = page.originalIndex + 1;

        if (page.externalBytes) {
          const extPdf = await pdfjsLib.getDocument({
            data: page.externalBytes,
            cMapUrl: `${window.location.origin}/cmaps/`,
            cMapPacked: true,
            standardFontDataUrl: `${window.location.origin}/standard_fonts/`,
            wasmUrl: `${window.location.origin}/wasm/`,
          }).promise;
          pageDoc = extPdf;
          idxOffset = (page.externalOriginalIndex ?? 0) + 1;
        }

        const pdfjsPage = await pageDoc.getPage(idxOffset);
        if (!active || !canvasRef.current) return;

        const rotationAngle = (pdfjsPage.rotate + (page.rotation || 0)) % 360;
        const viewport = pdfjsPage.getViewport({ scale: debouncedScaleRef.current, rotation: rotationAngle });

        renderTask = pdfjsPage.render({
          canvasContext: context,
          viewport: viewport,
          canvas: canvas,
        });

        await renderTask.promise;
      } catch (err) {
        const error = err as { name?: string };
        if (error.name !== 'RenderingCancelledException') {
          console.error("Error rendering page content:", err);
        }
      }
    };

    renderPage();

    return () => {
      active = false;
      if (renderTask) {
        renderTask.cancel();
      }
    };
  }, [dimensions, page, pdfjsDoc]);

  // Drawing Local State
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPoints, setCurrentPoints] = useState<{ x: number; y: number }[]>([]);

  // Draw annotations (freehand pencil and highlighter lines) on top
  useEffect(() => {
    if (!dimensions || !drawingCanvasRef.current) return;
    const canvas = drawingCanvasRef.current;
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const scaleFactor = dimensions.width / 595.28;

    // Draw completed drawings
    drawings.forEach((stroke) => {
      if (stroke.points.length < 2) return;
      ctx.beginPath();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width * scaleFactor;
      
      if (stroke.type === 'highlight') {
        ctx.globalAlpha = 0.45;
      } else {
        ctx.globalAlpha = 1.0;
      }

      const first = stroke.points[0];
      ctx.moveTo((first.x / 100) * canvas.width, (first.y / 100) * canvas.height);
      for (let i = 1; i < stroke.points.length; i++) {
        const pt = stroke.points[i];
        ctx.lineTo((pt.x / 100) * canvas.width, (pt.y / 100) * canvas.height);
      }
      ctx.stroke();
    });

    // Draw active drawing in progress
    if (isDrawing && currentPoints.length >= 2) {
      ctx.beginPath();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = toolMode === 'highlight' ? '#ffff00' : drawColor;
      ctx.lineWidth = drawWidth * scaleFactor;
      
      if (toolMode === 'highlight') {
        ctx.globalAlpha = 0.45;
      } else {
        ctx.globalAlpha = 1.0;
      }

      const first = currentPoints[0];
      ctx.moveTo((first.x / 100) * canvas.width, (first.y / 100) * canvas.height);
      for (let i = 1; i < currentPoints.length; i++) {
        const pt = currentPoints[i];
        ctx.lineTo((pt.x / 100) * canvas.width, (pt.y / 100) * canvas.height);
      }
      ctx.stroke();
    }
    
    ctx.globalAlpha = 1.0;
  }, [drawings, dimensions, isDrawing, currentPoints, toolMode, drawColor, drawWidth]);

  // Coordinate helpers for drawing
  const getMouseCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = drawingCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    return { x, y };
  };

  const getTouchCoords = (e: React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = drawingCanvasRef.current;
    if (!canvas || e.touches.length === 0) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    const x = ((touch.clientX - rect.left) / rect.width) * 100;
    const y = ((touch.clientY - rect.top) / rect.height) * 100;
    return { x, y };
  };

  // Drawing event handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (toolMode === 'text' || toolMode === 'select') return;
    const { x, y } = getMouseCoords(e);

    if (toolMode === 'erase') {
      eraseStrokeAt(x, y);
      setIsDrawing(true);
    } else {
      setIsDrawing(true);
      setCurrentPoints([{ x, y }]);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const { x, y } = getMouseCoords(e);

    if (toolMode === 'erase') {
      eraseStrokeAt(x, y);
    } else {
      setCurrentPoints((prev) => [...prev, { x, y }]);
    }
  };

  const handleMouseUp = () => {
    if (!isDrawing) return;
    setIsDrawing(false);

    if (toolMode !== 'erase' && currentPoints.length >= 2) {
      const newStroke: DrawingStroke = {
        id: 'stroke_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
        pageId: page.pageId,
        type: toolMode === 'highlight' ? 'highlight' : 'draw',
        color: toolMode === 'highlight' ? '#ffff00' : drawColor,
        width: drawWidth,
        points: currentPoints,
      };
      onAddDrawingStroke(page.pageId, newStroke);
    }
    setCurrentPoints([]);
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (toolMode === 'text' || toolMode === 'select') return;
    e.preventDefault();
    const { x, y } = getTouchCoords(e);

    if (toolMode === 'erase') {
      eraseStrokeAt(x, y);
      setIsDrawing(true);
    } else {
      setIsDrawing(true);
      setCurrentPoints([{ x, y }]);
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    e.preventDefault();
    const { x, y } = getTouchCoords(e);

    if (toolMode === 'erase') {
      eraseStrokeAt(x, y);
    } else {
      setCurrentPoints((prev) => [...prev, { x, y }]);
    }
  };

  const eraseStrokeAt = (x: number, y: number) => {
    drawings.forEach((stroke) => {
      const match = stroke.points.some((pt) => {
        const dist = Math.sqrt(Math.pow(pt.x - x, 2) + Math.pow(pt.y - y, 2));
        return dist < 3.0; // 3% tolerance
      });
      if (match) {
        onDeleteDrawingStroke(page.pageId, stroke.id);
      }
    });
  };

  const handleAddTextCenter = () => {
    onAddText(page.pageId, 35, 45);
  };

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target !== overlayRef.current) return;

    if (toolMode === 'text') {
      const overlay = overlayRef.current;
      const rect = overlay.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;

      const xPercent = (clickX / rect.width) * 100;
      const yPercent = (clickY / rect.height) * 100;

      onAddText(page.pageId, xPercent, yPercent);
    } else {
      onDeselectBlocks();
    }
  };

  const pageTypeLabel = page.isBlank ? 'EN BLANCO' : page.externalBytes ? 'IMPORTADO' : 'ORIGINAL';
  const sizeLabel = intrinsicSize ? `${Math.round(intrinsicSize.width)} × ${Math.round(intrinsicSize.height)} pt` : '';
  const rotationLabel = page.rotation && page.rotation !== 0 ? ` [ROT: ${page.rotation}°]` : '';

  return (
    <div
      id={`page-wrapper-${page.pageId}`}
      className={`page-wrapper ${page.pageId === activePageId ? 'active-page-focus' : ''}`}
      onClick={() => onFocusPage(page.pageId)}
      onMouseMove={(e) => {
        if (onHoverCoords && intrinsicSize) {
          const rect = e.currentTarget.getBoundingClientRect();
          const clickX = e.clientX - rect.left;
          const clickY = e.clientY - rect.top;
          const xPercent = (clickX / rect.width) * 100;
          const yPercent = (clickY / rect.height) * 100;
          onHoverCoords({
            x: xPercent,
            y: yPercent,
            width: Math.round(intrinsicSize.width),
            height: Math.round(intrinsicSize.height),
            pageIndex: index,
          });
        }
      }}
      onMouseLeave={() => {
        if (onHoverCoords) {
          onHoverCoords(null);
        }
      }}
      style={
        intrinsicSize
          ? {
              width: `${intrinsicSize.width * renderScale}px`,
              height: `${intrinsicSize.height * renderScale}px`,
              position: 'relative',
            }
          : { minHeight: '600px', width: '100%', maxWidth: '800px', position: 'relative' }
      }
    >
      {/* Floating page-level controls (always visible) */}
      <div className="page-wrapper-floating-bar">
        <span className="page-num-indicator">
          PÁG. {index + 1}
        </span>
        
        <span className="bar-separator"></span>
        
        <span className="page-size-indicator">
          {pageTypeLabel} ({sizeLabel}){rotationLabel}
        </span>
        
        <span className="bar-separator"></span>
        
        {toolMode === 'text' && (
          <>
            <button
              className="btn btn-secondary btn-small"
              onClick={handleAddTextCenter}
              title="Añadir texto al centro"
              style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
            >
              <Plus size={10} style={{ marginRight: '2px' }} /> + Texto
            </button>
            <span className="bar-separator"></span>
          </>
        )}

        <button
          className="btn-rotate"
          onClick={() => onDeletePage(page.pageId)}
          title="Eliminar página"
          style={{ width: '22px', height: '22px', padding: 0, color: 'var(--danger)' }}
        >
          <Trash2 size={12} />
        </button>
      </div>

      {/* Main page PDF canvas */}
      <canvas ref={canvasRef} width={dimensions?.width} height={dimensions?.height}></canvas>

      {/* Drawing Overlay Canvas (pointerEvents disabled if in text or select mode) */}
      <canvas
        ref={drawingCanvasRef}
        className="drawing-canvas"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          zIndex: 2,
          pointerEvents: (toolMode === 'draw' || toolMode === 'highlight' || toolMode === 'erase') ? 'auto' : 'none',
          cursor: toolMode === 'erase' ? 'cell' : 'crosshair',
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleMouseUp}
      ></canvas>

      {/* Watermark Overlay Text */}
      {watermark && watermark.text && (
        <div
          className="watermark-overlay"
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%) rotate(-45deg)',
            fontSize: `${watermark.fontSize * renderScale}px`,
            color: watermark.color,
            opacity: watermark.opacity,
            fontWeight: 'bold',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            userSelect: 'none',
            zIndex: 1,
          }}
        >
          {watermark.text}
        </div>
      )}

      {/* Text block overlay */}
      <div
        ref={overlayRef}
        className="text-overlay"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          zIndex: 3,
          pointerEvents: (toolMode === 'text' || toolMode === 'select') ? 'auto' : 'none',
          cursor: toolMode === 'text' ? 'text' : 'default',
        }}
        onClick={handleOverlayClick}
      >
        {textBlocks.map((block) => (
          <TextBlock
            key={block.id}
            block={block}
            isActive={block.id === activeTextBlockId}
            renderScale={renderScale}
            onSelect={onSelectBlock}
            onMove={onMoveBlock}
            onDelete={onDeleteBlock}
            onChangeText={onChangeTextBlockText}
          />
        ))}
      </div>
    </div>
  );
};
