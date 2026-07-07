import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextStyle from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import FontFamily from "@tiptap/extension-font-family";
import TextAlign from "@tiptap/extension-text-align";
import Link from "@tiptap/extension-link";
import { ResizableImage } from "./ResizableImage.jsx";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";
import { FontSize, LineHeight } from "./tiptapExtensions.js";
import { TokenNode } from "./TokenNode.js";

/** Jeu d'extensions partagé par les éditeurs (corps, en-tête, pied de page). */
export function buildExtensions({ tokens = true } = {}) {
  const ext = [
    StarterKit,
    Underline,
    TextStyle,
    Color,
    Highlight.configure({ multicolor: true }),
    FontFamily,
    FontSize,
    LineHeight,
    TextAlign.configure({ types: ["heading", "paragraph"] }),
    Link.configure({ openOnClick: false, autolink: true }),
    ResizableImage.configure({ inline: false, allowBase64: true }),
    Table.configure({ resizable: true }),
    TableRow,
    TableHeader,
    TableCell,
  ];
  if (tokens) ext.push(TokenNode);
  return ext;
}

export const FONT_SIZES = ["9pt", "10pt", "11pt", "12pt", "14pt", "16pt", "18pt", "24pt", "32pt"];
export const FONTS = [
  { label: "Sans-serif", value: "Arial, sans-serif" },
  { label: "Serif", value: "Georgia, 'Times New Roman', serif" },
  { label: "Mono", value: "'Courier New', monospace" },
];
export const LINE_HEIGHTS = [
  { label: "Simple", value: "1.2" },
  { label: "1,5", value: "1.5" },
  { label: "Double", value: "2" },
];
export const TEXT_COLORS = ["#1a1a1a", "#c0392b", "#1d6fb8", "#2e9e5b", "#e08a00", "#8e44ad", "#555555"];
export const HIGHLIGHTS = ["#fff3a3", "#ffd0c4", "#c8f0d2", "#cfe4ff", "#ead4ff"];
