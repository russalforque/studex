import { interpolate, useCurrentFrame } from "remotion";
import { Device, F, Stage, useEnter, Words } from "../kit";
import { scene } from "../timeline";

const { duration } = scene("open");

// Labels land as the narration names them.
const CHIPS = [
  { text: "Classes", at: 32, x: 330, y: 470 },
  { text: "Deadlines", at: 52, x: 1400, y: 430 },
  { text: "Exams", at: 70, x: 420, y: 760 },
  { text: "Allowance", at: 96, x: 1330, y: 740 },
];

const Phone: React.FC<{ screen: "schedule" | "home" | "budget"; x: number; at: number; turn: number; depth: number }> = ({ screen, x, at, turn, depth }) => {
  const frame = useCurrentFrame();
  const p = useEnter(at, 40);
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: 330 + depth,
        opacity: p,
        filter: `blur(${(1 - p) * 12}px) brightness(${depth ? 0.78 : 1})`,
        transform: `perspective(2600px) translateY(${(1 - p) * 260 - frame * 0.25}px) rotateY(${turn}deg) rotateX(8deg)`,
      }}
    >
      <Device screen={screen} width={depth ? 360 : 410} />
    </div>
  );
};

export const Open: React.FC = () => (
  <Stage dark duration={duration}>
    <Phone screen="schedule" x={470} at={6} turn={24} depth={60} />
    <Phone screen="budget" x={1090} at={14} turn={-24} depth={60} />
    <Phone screen="home" x={755} at={0} turn={0} depth={0} />
    {CHIPS.map((c) => (
      <Chip key={c.text} {...c} />
    ))}
    <Words
      text="Student life moves fast."
      start={128}
      style={{ position: "absolute", top: 120, width: "100%", textAlign: "center", fontSize: 96, fontWeight: 800, letterSpacing: -3.5 }}
    />
  </Stage>
);

const Chip: React.FC<(typeof CHIPS)[number]> = ({ text, at, x, y }) => {
  const frame = useCurrentFrame();
  const p = useEnter(at, 20);
  const out = interpolate(frame, [120, 135], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y - p * 20,
        opacity: p * out,
        scale: String(0.9 + p * 0.1),
        padding: "16px 30px",
        borderRadius: 999,
        background: "rgb(255 255 255 / 0.1)",
        border: "1px solid rgb(255 255 255 / 0.22)",
        backdropFilter: "blur(16px)",
        color: "#fff",
        fontSize: 32,
        fontWeight: 700,
        boxShadow: `0 20px 50px -20px ${F.brand}`,
      }}
    >
      {text}
    </div>
  );
};
