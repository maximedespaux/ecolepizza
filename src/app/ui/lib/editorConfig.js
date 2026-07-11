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
import { FontSize, LineHeight, PageBreak } from "./tiptapExtensions.js";
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
    PageBreak,
    TextAlign.configure({ types: ["heading", "paragraph"] }),
    Link.configure({ openOnClick: false, autolink: true }),
    ResizableImage.configure({ inline: true, allowBase64: true }),
    Table.configure({ resizable: true }),
    TableRow,
    TableHeader,
    TableCell,
  ];
  if (tokens) ext.push(TokenNode);
  return ext;
}

export const FONT_SIZES = ["6pt", "7pt", "8pt", "9pt", "10pt", "11pt", "12pt", "14pt", "16pt", "18pt", "24pt", "32pt"];
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

// Palette « façon Paint » : grille de carrés (8 colonnes) pour la couleur du texte.
export const COLOR_SWATCHES = [
  "#000000", "#434343", "#666666", "#999999", "#b7b7b7", "#cccccc", "#efefef", "#ffffff",
  "#980000", "#ff0000", "#ff9900", "#ffff00", "#00ff00", "#00ffff", "#4a86e8", "#0000ff",
  "#9900ff", "#ff00ff", "#e6b8af", "#f4cccc", "#fce5cd", "#fff2cc", "#d9ead3", "#d0e0e3",
  "#c0392b", "#e08a00", "#2e9e5b", "#1d6fb8", "#8e44ad", "#c27ba0", "#674ea7", "#1a1a1a",
];
// Palette de surlignage (tons pastel).
export const HIGHLIGHT_SWATCHES = [
  "#fff3a3", "#ffd0c4", "#c8f0d2", "#cfe4ff", "#ead4ff",
  "#ffe08a", "#ffb3b3", "#b3f0c2", "#b3d4ff", "#e0b3ff",
];
