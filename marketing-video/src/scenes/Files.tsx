import { FileText } from "lucide-react";
import { interpolate, useCurrentFrame } from "remotion";
import { C } from "../theme";
import { Headline, IconCircle, Phone, Scene, useProgress } from "../ui";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

export const Files: React.FC = () => {
  const frame = useCurrentFrame();
  const scan = interpolate(frame, [30, 80], [0, 1], clamp);
  const flash = interpolate(frame, [80, 82, 90], [0, 0.8, 0], clamp);
  const saved = useProgress(88, 14);
  return (
    <Scene>
      <Headline kicker="Notes & files" kickerColor={C.lime} title="Scan handouts." sub="Camera to clean PDF, filed by subject." />
      <Phone>
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "#26262b",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 70,
            right: 70,
            top: 150,
            height: 700,
            rotate: "-2deg",
            background: "#fbfaf6",
            borderRadius: 10,
            padding: 44,
            boxShadow: "0 30px 60px rgb(0 0 0 / 0.5)",
          }}
        >
          <div style={{ fontSize: 30, fontWeight: 800, color: C.ink }}>Organic Chem · Handout 3</div>
          {Array.from({ length: 13 }).map((_, i) => (
            <div
              key={i}
              style={{
                height: 12,
                marginTop: 26,
                borderRadius: 6,
                width: `${[92, 84, 96, 70, 88, 94, 60, 90, 82, 97, 75, 86, 50][i]}%`,
                background: "#d9d7cf",
              }}
            />
          ))}
          {/* Scan line */}
          <div
            style={{
              position: "absolute",
              left: -10,
              right: -10,
              top: `${scan * 100}%`,
              height: 6,
              background: C.lime,
              boxShadow: `0 0 40px 12px ${C.lime}`,
              opacity: scan > 0 && scan < 1 ? 1 : 0,
            }}
          />
        </div>
        {/* Corner brackets */}
        {[
          { left: 44, top: 124, borderLeft: true, borderTop: true },
          { right: 44, top: 124, borderRight: true, borderTop: true },
          { left: 44, top: 830, borderLeft: true, borderBottom: true },
          { right: 44, top: 830, borderRight: true, borderBottom: true },
        ].map(({ borderLeft, borderTop, borderRight, borderBottom, ...pos }, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              width: 70,
              height: 70,
              ...pos,
              borderColor: C.lime,
              borderStyle: "solid",
              borderWidth: `${borderTop ? 8 : 0}px ${borderRight ? 8 : 0}px ${borderBottom ? 8 : 0}px ${borderLeft ? 8 : 0}px`,
              borderRadius: 14,
            }}
          />
        ))}
        <div style={{ position: "absolute", inset: 0, background: "#fff", opacity: flash }} />
        <div
          style={{
            position: "absolute",
            left: 34,
            right: 34,
            bottom: 120,
            background: C.surface,
            borderRadius: 34,
            padding: 26,
            display: "flex",
            alignItems: "center",
            gap: 22,
            opacity: saved,
            translate: `0px ${(1 - saved) * 60}px`,
          }}
        >
          <IconCircle bg={C.lime} size={76}>
            <FileText size={40} color={C.limeInk} />
          </IconCircle>
          <div>
            <div style={{ fontSize: 32, fontWeight: 800 }}>Handout 3.pdf saved</div>
            <div style={{ fontSize: 26, fontWeight: 600, color: C.ink2 }}>3 pages · Organic Chemistry</div>
          </div>
        </div>
      </Phone>
    </Scene>
  );
};
