import { interpolate, useCurrentFrame } from "remotion";
import { C } from "../theme";
import { EASE, Rise, Scene } from "../ui";

const WORDS = [
  { text: "Classes.", color: C.sky },
  { text: "Tasks.", color: C.mint },
  { text: "Exams.", color: C.pink },
  { text: "Allowance.", color: C.lime },
  { text: "Savings.", color: C.peach },
];

export const Hook: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <Scene background={C.ink}>
      <div style={{ position: "absolute", left: 100, right: 100, top: 470 }}>
        {WORDS.map((w, i) => {
          const start = i * 9;
          return (
            <div
              key={w.text}
              style={{
                fontSize: 150,
                fontWeight: 800,
                letterSpacing: -5,
                lineHeight: 1.08,
                color: w.color,
                opacity: interpolate(frame, [start, start + 10], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                }),
                translate: `${interpolate(frame, [start, start + 14], [-60, 0], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                  easing: EASE,
                })}px 0px`,
              }}
            >
              {w.text}
            </div>
          );
        })}
        <Rise start={56}>
          <div style={{ marginTop: 60, fontSize: 64, fontWeight: 600, color: "#fff", lineHeight: 1.2 }}>
            A lot to juggle?
          </div>
        </Rise>
      </div>
    </Scene>
  );
};
