import { loadFont } from "@remotion/fonts";
import { staticFile } from "remotion";

// Same tokens as the app (src/index.css), so the video looks like Studex.
export const C = {
  bg: "#f2f2f4",
  surface: "#ffffff",
  surface2: "#f4f4f6",
  line: "#e9e9ed",
  ink: "#111113",
  ink2: "#5b5b63",
  ink3: "#8e8e97",
  mint: "#d3f0df",
  mintInk: "#1d8a55",
  sky: "#d9ebf8",
  skyInk: "#2869a8",
  pink: "#fad6e8",
  pinkInk: "#c0337a",
  lime: "#e2f29c",
  limeInk: "#5a7710",
  peach: "#fde1cb",
  peachInk: "#c05a16",
  lilac: "#e5e1fb",
  lilacInk: "#5a4dd3",
  sun: "#fcefbd",
  sunInk: "#9c7204",
  brand: "#1463ff",
};

export const FONT = "Manrope";

export const fontReady = loadFont({
  family: FONT,
  url: staticFile("manrope.woff2"),
  weight: "200 800",
});

export const SHADOW_CARD =
  "0 2px 4px rgb(16 16 24 / 0.04), 0 16px 48px -24px rgb(16 16 24 / 0.16)";
