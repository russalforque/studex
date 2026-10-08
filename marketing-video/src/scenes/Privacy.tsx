import { CloudOff, ShieldCheck, Smartphone, UserX } from "lucide-react";
import { spring, useCurrentFrame, useVideoConfig } from "remotion";
import { C } from "../theme";
import { IconCircle, Rise, Scene } from "../ui";

const POINTS = [
  { icon: CloudOff, bg: C.sky, ink: C.skyInk, text: "Works offline" },
  { icon: UserX, bg: C.pink, ink: C.pinkInk, text: "No account needed" },
  { icon: Smartphone, bg: C.lime, ink: C.limeInk, text: "Data stays on your phone" },
];

export const Privacy: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame, fps, config: { damping: 12 } });
  return (
    <Scene background={C.ink}>
      <div style={{ position: "absolute", left: 100, right: 100, top: 380 }}>
        <div style={{ scale: String(pop), transformOrigin: "left center" }}>
          <IconCircle bg={C.mint} size={180}>
            <ShieldCheck size={96} color={C.mintInk} />
          </IconCircle>
        </div>
        <Rise start={8}>
          <div style={{ marginTop: 56, fontSize: 112, fontWeight: 800, letterSpacing: -4, lineHeight: 1.02, color: "#fff" }}>
            Private
            <br />
            by design.
          </div>
        </Rise>
        <div style={{ marginTop: 70 }}>
          {POINTS.map((p, i) => (
            <Rise key={p.text} start={[12, 46, 70][i]}>
              <div style={{ display: "flex", alignItems: "center", gap: 32, marginTop: 34 }}>
                <IconCircle bg={p.bg} size={96}>
                  <p.icon size={50} color={p.ink} />
                </IconCircle>
                <div style={{ fontSize: 54, fontWeight: 700, color: "#fff" }}>{p.text}</div>
              </div>
            </Rise>
          ))}
        </div>
      </div>
    </Scene>
  );
};
