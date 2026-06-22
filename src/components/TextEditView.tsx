import React from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import type { Page, TextBlock as TextBlockType, DrawingStroke, Watermark } from '../types';
import { PageWrapper } from './PageWrapper';

interface TextEditViewProps {
  pages: Page[];
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
}

export const TextEditView: React.FC<TextEditViewProps> = ({
  pages,
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
}) => {
  return (
    <div id="pages-container" className="pages-container text-mode-view">
      {pages.map((page, index) => {
        // Filter blocks belonging specifically to this pageId
        const pageBlocks = textBlocks.filter((b) => b.pageId === page.pageId);
        const pageDrawings = drawings.filter((d) => d.pageId === page.pageId);

        return (
          <PageWrapper
            key={page.pageId}
            page={page}
            index={index}
            pdfjsDoc={pdfjsDoc}
            textBlocks={pageBlocks}
            drawings={pageDrawings}
            watermark={watermark}
            activeTextBlockId={activeTextBlockId}
            renderScale={renderScale}
            onAddText={onAddText}
            onSelectBlock={onSelectBlock}
            onMoveBlock={onMoveBlock}
            onDeleteBlock={onDeleteBlock}
            onChangeTextBlockText={onChangeTextBlockText}
            onDeselectBlocks={onDeselectBlocks}
            // Pass drawing / tool properties:
            toolMode={toolMode}
            drawColor={drawColor}
            drawWidth={drawWidth}
            onAddDrawingStroke={onAddDrawingStroke}
            onDeleteDrawingStroke={onDeleteDrawingStroke}
            onDeletePage={onDeletePage}
            activePageId={activePageId}
            onFocusPage={onFocusPage}
          />
        );
      })}
    </div>
  );
};
