import React, { useRef, useEffect } from 'react';
import type { TextBlock as TextBlockType } from '../types';

interface TextBlockProps {
  block: TextBlockType;
  isActive: boolean;
  renderScale: number;
  onSelect: (id: string) => void;
  onMove: (id: string, x: number, y: number) => void;
  onDelete: (id: string) => void;
  onChangeText: (id: string, text: string) => void;
}

export const TextBlock: React.FC<TextBlockProps> = ({
  block,
  isActive,
  renderScale,
  onSelect,
  onMove,
  onDelete,
  onChangeText,
}) => {
  const blockRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (isActive && block.text === '' && contentRef.current) {
      setTimeout(() => {
        if (contentRef.current) {
          contentRef.current.focus();
        }
      }, 50);
    }
  }, [isActive, block.text]);

  const getCssFontFamily = (font: string) => {
    if (font === 'TimesNewRoman') return '"Times New Roman", Times, serif';
    if (font === 'Courier') return 'Courier, "Courier New", monospace';
    return 'Helvetica, Arial, sans-serif';
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    if (target.classList.contains('text-block-delete')) return;

    e.preventDefault();
    const blockEl = blockRef.current;
    const parentEl = blockEl?.parentElement;
    if (!blockEl || !parentEl) return;

    const startX = e.clientX;
    const startY = e.clientY;
    const startLeft = block.x;
    const startTop = block.y;

    const parentWidth = parentEl.offsetWidth;
    const parentHeight = parentEl.offsetHeight;

    let isDragging = false;

    const handlePointerMove = (moveEv: PointerEvent) => {
      const dx = moveEv.clientX - startX;
      const dy = moveEv.clientY - startY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance > 4 && !isDragging) {
        isDragging = true;
        onSelect(block.id);
      }

      if (isDragging) {
        const dxPercent = (dx / parentWidth) * 100;
        const dyPercent = (dy / parentHeight) * 100;

        let nextX = startLeft + dxPercent;
        let nextY = startTop + dyPercent;

        // Boundaries limit to prevent text blocks from flying out
        nextX = Math.max(0, Math.min(95, nextX));
        nextY = Math.max(0, Math.min(98, nextY));

        onMove(block.id, nextX, nextY);
      }
    };

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);

      if (!isDragging) {
        onSelect(block.id);
        contentRef.current?.focus();
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  const handleInput = (e: React.FormEvent<HTMLSpanElement>) => {
    onChangeText(block.id, e.currentTarget.textContent || '');
  };

  return (
    <div
      ref={blockRef}
      className={`text-block ${isActive ? 'active' : ''}`}
      style={{
        left: `${block.x}%`,
        top: `${block.y}%`,
        fontFamily: getCssFontFamily(block.font),
        fontSize: `${(block.fontSize || 12) * renderScale}px`,
        color: block.color,
      }}
      onPointerDown={handlePointerDown}
    >
      <span
        ref={contentRef}
        className="text-content"
        contentEditable
        suppressContentEditableWarning
        spellCheck={false}
        onInput={handleInput}
      >
        {block.text}
      </span>
      <button
        className="text-block-delete"
        title="Eliminar bloque"
        onClick={() => onDelete(block.id)}
      >
        &times;
      </button>
    </div>
  );
};
