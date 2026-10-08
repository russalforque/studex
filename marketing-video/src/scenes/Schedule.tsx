import { Check, Clock, MapPin } from "lucide-react";
import { interpolate, useCurrentFrame } from "remotion";
import { C } from "../theme";
import { Card, Headline, Hero, Label, Phone, Rise, Scene, useProgress } from "../ui";

const TASKS = [
  { title: "Lab report", subject: "Chemistry", color: C.pinkInk, at: 60 },
  { title: "Read chapter 4", subject: "History", color: C.peachInk, at: 80 },
  { title: "Problem set 7", subject: "Calculus II", color: C.skyInk, at: 100 },
];

const TaskRow: React.FC<(typeof TASKS)[number]> = ({ title, subject, color, at }) => {
  const done = useProgress(at, 10);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 22, padding: "18px 0" }}>
      <div
        style={{
          width: 52,
          height: 52,
          borderRadius: "50%",
          border: `3px solid ${done > 0.5 ? C.ink : C.line}`,
          background: done > 0.5 ? C.ink : "transparent",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          scale: String(1 + Math.sin(done * Math.PI) * 0.2),
        }}
      >
        <Check size={30} color="#fff" strokeWidth={3.5} style={{ opacity: done }} />
      </div>
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontSize: 32,
            fontWeight: 700,
            color: done > 0.5 ? C.ink3 : C.ink,
            textDecoration: done > 0.5 ? "line-through" : "none",
          }}
        >
          {title}
        </div>
        <div style={{ fontSize: 24, fontWeight: 600, color }}>{subject}</div>
      </div>
    </div>
  );
};

export const Schedule: React.FC = () => {
  const frame = useCurrentFrame();
  const mins = Math.round(interpolate(frame, [20, 150], [25, 18], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  return (
    <Scene>
      <Headline kicker="Classes & tasks" kickerColor={C.sky} title="Know what's next." sub="Today's classes and to-dos at a glance." />
      <Phone>
        <div style={{ fontSize: 24, fontWeight: 600, color: C.ink2 }}>Good morning · Thu, Oct 8</div>
        <div style={{ fontSize: 56, fontWeight: 800, marginBottom: 26 }}>Juan</div>
        <Rise start={18}>
          <Hero bg={C.sky}>
            <Label color={C.skyInk}>Next class · in {mins} min</Label>
            <div style={{ fontSize: 50, fontWeight: 800, marginTop: 12 }}>Calculus II</div>
            <div style={{ display: "flex", gap: 26, marginTop: 14, fontSize: 28, fontWeight: 600, color: C.ink2 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Clock size={28} /> 9:30 – 11:00
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <MapPin size={28} /> Room 304
              </span>
            </div>
          </Hero>
        </Rise>
        <Rise start={30}>
          <div style={{ fontSize: 34, fontWeight: 800, margin: "34px 0 16px 6px" }}>Due today</div>
          <Card style={{ padding: "8px 28px" }}>
            {TASKS.map((t) => (
              <TaskRow key={t.title} {...t} />
            ))}
          </Card>
        </Rise>
      </Phone>
    </Scene>
  );
};
