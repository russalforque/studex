import { interpolate, useCurrentFrame } from "remotion";
import { Device, F, Stage, useEnter, useTall, Words } from "../kit";
import { scene } from "../timeline";

const { duration } = scene("open");

// Labels land as the narration names them.
const CHIPS = [
  { text: "Classes", at: 32, x: 330, y: 470, tx: 80, ty: 820 },
  { text: "Deadlines", at: 52, x: 1400, y: 430, tx: 700, ty: 760 },
  { text: "Exams", at: 70, x: 420, y: 760, tx: 110, ty: 1460 },
  { text: "Allowance", at: 96, x: 1330, y: 740, tx: 680, ty: 1400 },
];

const Phone: React.FC<{ screen: "schedule" | "home" | "budget"; x: number; tx: number; at: number; turn: number; depth: number }> = ({ screen, x, tx, at, turn, depth }) => {
  const frame = useCurrentFrame();
  const tall = useTall();
  const p = useEnter(at, 40);
  return (
    <div
      style={{
        position: "absolute",
        left: tall ? tx : x,
        top: (tall ? 760 : 330) + depth,
        opacity: p,
        filter: `blur(${(1 - p) * 12}px) brightness(${depth ? 0.78 : 1})`,
        transform: `perspective(2600px) translateY(${(1 - p) * 260 - frame * 0.25}px) rotateY(${turn}deg) rotateX(8deg)`,
      }}
    >
      <Device screen={screen} width={(depth ? 360 : 410) * (tall ? 1.12 : 1)} />
    </div>
  );
};

export const Open: React.FC = () => {
  const tall = useTall();
  return (
    <Stage dark duration={duration}>
      <Phone screen="schedule" x={470} tx={10} at={6} turn={24} depth={60} />
      <Phone screen="budget" x={1090} tx={665} at={14} turn={-24} depth={60} />
      <Phone screen="home" x={755} tx={310} at={0} turn={0} depth={0} />
      {CHIPS.map((c) => (
        <Chip key={c.text} {...c} />
      ))}
      <Words
        text={tall ? "Student life\nmoves fast." : "Student life moves fast."}
        start={128}
        style={{ position: "absolute", top: tall ? 300 : 120, width: "100%", textAlign: "center", fontSize: tall ? 120 : 96, fontWeight: 800, letterSpacing: -3.5, lineHeight: 1.05 }}
      />
    </Stage>
  );
};

const Chip: React.FC<(typeof CHIPS)[number]> = ({ text, at, x, y, tx, ty }) => {
  const frame = useCurrentFrame();
  const tall = useTall();
  const p = useEnter(at, 20);
  const out = interpolate(frame, [120, 135], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div
      style={{
        position: "absolute",
        left: tall ? tx : x,
        top: (tall ? ty : y) - p * 20,
        opacity: p * out,
        scale: String(0.9 + p * 0.1),
        padding: "16px 30px",
        borderRadius: 999,
        background: "rgb(255 255 255 / 0.1)",
        border: "1px solid rgb(255 255 255 / 0.22)",
        backdropFilter: "blur(16px)",
        color: "#fff",
        fontSize: tall ? 38 : 32,
        fontWeight: 700,
        boxShadow: `0 20px 50px -20px ${F.brand}`,
      }}
    >
      {text}
    </div>
  );
};
