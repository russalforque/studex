import { ShieldCheck } from "lucide-react";
import { F, Fade, Stage, useEnter, Words } from "../kit";
import { scene } from "../timeline";

const { duration } = scene("privacy");

const Pill: React.FC<{ at: number; children: React.ReactNode }> = ({ at, children }) => {
  const p = useEnter(at, 20);
  return (
    <div
      style={{
        opacity: p,
        scale: String(0.9 + p * 0.1),
        filter: `blur(${(1 - p) * 8}px)`,
        padding: "16px 34px",
        borderRadius: 999,
        border: "1px solid rgb(255 255 255 / 0.25)",
        background: "rgb(255 255 255 / 0.08)",
        fontSize: 34,
        fontWeight: 700,
      }}
    >
      {children}
    </div>
  );
};

export const Privacy: React.FC = () => {
  const icon = useEnter(0, 30);
  return (
    <Stage dark duration={duration}>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
        <div
          style={{
            width: 140,
            height: 140,
            borderRadius: 40,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: `linear-gradient(135deg, ${F.brandSoft}, ${F.brand})`,
            boxShadow: `0 30px 80px -20px ${F.brand}`,
            opacity: icon,
            scale: String(0.8 + icon * 0.2),
          }}
        >
          <ShieldCheck size={76} color="#fff" strokeWidth={1.8} />
        </div>
        <Words text="Completely offline." start={26} style={{ marginTop: 56, fontSize: 120, fontWeight: 800, letterSpacing: -5 }} />
        <div style={{ display: "flex", gap: 20, marginTop: 44 }}>
          <Pill at={80}>No account</Pill>
          <Pill at={106}>No ads</Pill>
        </div>
        <Fade start={128}>
          <div style={{ marginTop: 44, fontSize: 44, fontWeight: 500, color: "#b9c4de" }}>Your data never leaves your phone.</div>
        </Fade>
      </div>
    </Stage>
  );
};
