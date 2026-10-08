import { Check, GraduationCap } from "lucide-react";
import { interpolate, useCurrentFrame } from "remotion";
import { C } from "../theme";
import { Bar, Card, Headline, Hero, IconCircle, Label, Phone, Rise, Scene, useProgress } from "../ui";

const TOPICS = ["Kinematics", "Newton's laws", "Work & energy", "Momentum", "Rotation", "Gravitation"];

const Topic: React.FC<{ name: string; at: number | null }> = ({ name, at }) => {
  const done = useProgress(at ?? 9999, 8);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 18, padding: "11px 0" }}>
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          background: done > 0.5 ? C.pinkInk : C.surface2,
          border: done > 0.5 ? "none" : `3px solid ${C.line}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Check size={26} color="#fff" strokeWidth={3.5} style={{ opacity: done }} />
      </div>
      <div style={{ fontSize: 30, fontWeight: 600, color: done > 0.5 ? C.ink2 : C.ink }}>{name}</div>
    </div>
  );
};

export const Exams: React.FC = () => {
  const frame = useCurrentFrame();
  const doneCount = Math.min(4, Math.max(0, Math.floor((frame - 40) / 18) + 1));
  const progress = interpolate(frame, [40, 104], [0, 4 / 6], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <Scene>
      <Headline kicker="Exams & grades" kickerColor={C.pink} title="Ace every exam." sub="Countdowns, study topics, grade targets." />
      <Phone>
        <Rise start={14}>
          <Hero bg={C.pink}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <Label color={C.pinkInk}>Exam in 3 days</Label>
                <div style={{ fontSize: 50, fontWeight: 800, marginTop: 12 }}>Physics quiz</div>
                <div style={{ fontSize: 28, fontWeight: 600, color: C.ink2, marginTop: 6 }}>
                  Studying · {doneCount} of 6 topics
                </div>
              </div>
              <IconCircle bg="#fff" size={84}>
                <GraduationCap size={44} color={C.pinkInk} />
              </IconCircle>
            </div>
            <div style={{ marginTop: 24 }}>
              <Bar value={progress} color={C.pinkInk} track="rgb(255 255 255 / 0.6)" />
            </div>
          </Hero>
        </Rise>
        <Rise start={22}>
          <Card style={{ marginTop: 24, padding: "14px 28px" }}>
            {TOPICS.map((t, i) => (
              <Topic key={t} name={t} at={i < 4 ? 40 + i * 18 : null} />
            ))}
          </Card>
        </Rise>
        <Rise start={126}>
          <Card style={{ marginTop: 24, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 24, fontWeight: 600, color: C.ink2 }}>Physics · current grade</div>
              <div style={{ fontSize: 46, fontWeight: 800 }}>92%</div>
            </div>
            <div
              style={{
                padding: "12px 22px",
                borderRadius: 999,
                background: C.mint,
                color: C.mintInk,
                fontSize: 26,
                fontWeight: 700,
              }}
            >
              Target 90% ✓
            </div>
          </Card>
        </Rise>
      </Phone>
    </Scene>
  );
};
