export interface TextBlock {
  id: string;
  pageId: string;
  text: string;
  x: number; // Percentage (0-100) relative to page width
  y: number; // Percentage (0-100) relative to page height
  font: 'Helvetica' | 'TimesNewRoman' | 'Courier';
  fontSize: number;
  color: string;
  pageIndex?: number;
}

export interface Page {
  originalIndex: number;
  pageId: string;
  rotation?: number; // 0, 90, 180, 270 degrees
  isBlank?: boolean;
  externalBytes?: Uint8Array;
  externalOriginalIndex?: number;
}

export interface DrawingStroke {
  id: string;
  pageId: string;
  type: 'draw' | 'highlight';
  color: string;
  width: number;
  points: { x: number; y: number }[];
}

export interface Watermark {
  text: string;
  color: string;
  opacity: number;
  fontSize: number;
}

export interface Document {
  id: string;
  name: string;
  rawBytes: Uint8Array;
  pages: Page[];
  textBlocks: TextBlock[];
  loadedTextBlocks: TextBlock[]; // Baseline reference for cover-up rectangles
  drawings?: DrawingStroke[];
  watermark?: Watermark;
}

export interface AppState {
  documents: Document[];
  activeDocId: string | null;
  editorMode: 'text' | 'organize';
  activeTextBlockId: string | null;
}
