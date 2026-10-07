/** KAIA brand tokens — mirror of frontend/src/index.css so the film cannot drift from the product. */
export const BRAND = {
  plum: "#4b2848",
  burgundy: "#8a3f4a",
  lavender: "#c9b7d9",
  ivory: "#f8f4ee",
  green: "#8dae9b",
  charcoal: "#1f2937",
  muted: "#6b7280",
  surface: "#fffdfa",
  border: "#e8e0d4",
};

export const SERIF = '"Playfair Display", Georgia, serif';
export const SANS = 'Inter, -apple-system, "Segoe UI", sans-serif';

/** Soft organic wash — flow, continuity, progress. Never placed over data. */
export const VEIL =
  "radial-gradient(55% 40% at 88% 4%, rgba(201,183,217,.38) 0%, transparent 60%)," +
  "radial-gradient(55% 40% at 2% 97%, rgba(141,174,155,.24) 0%, transparent 58%)";

/** Scene lengths in frames at 30fps. Edit these to retime the film. */
export const FPS = 30;
export const TRANSITION = 12;
export const SCENES = {
  statement: 138,
  barriers: 192,
  insert: 123,
  cartridge: 171,
  reader: 255,
  chapter: 78,
  vision: 126,
  result: 108,
  care: 195,
  population: 102,
  end: 141,
} as const;
