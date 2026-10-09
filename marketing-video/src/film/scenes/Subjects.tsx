import { BookOpen, CalendarCheck, FileText, GraduationCap } from "lucide-react";
import { F, FloatingDevice, PopCard, Stage, TextBlock, useEnter, useTall } from "../kit";
import { scene } from "../timeline";

const { duration } = scene("subjects");

// Each lands as the narration names it.
const PARTS = [
  { icon: GraduationCap, label: "Grades", at: 50 },
  { icon: CalendarCheck, label: "Attendance", at: 68 },
  { icon: BookOpen, label: "Notes", at: 88 },
  { icon: FileText, label: "Files", at: 102 },
];

const Part: React.FC<(typeof PARTS)[number]> = ({ icon: Icon, label, at }) => {
  const tall = useTall();
  const p = useEnter(at, 18);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: tall ? "14px 26px" : "12px 22px",
        borderRadius: 999,
        background: "#fff",
        boxShadow: "0 10px 30px -12px rgb(8 12 30 / 0.25)",
        fontSize: tall ? 32 : 26,
        fontWeight: 700,
        opacity: p,
        scale: String(0.9 + p * 0.1),
        translate: `0px ${(1 - p) * 16}px`,
      }}
    >
      <Icon size={tall ? 32 : 26} color={F.brand} strokeWidth={2.2} />
      {label}
    </div>
  );
};

export const Subjects: React.FC = () => {
  const tall = useTall();
  return (
    <Stage duration={duration}>
      <TextBlock
        kicker="Subjects"
        title={"Every subject,\nin one place."}
        sub="Grades, attendance, notes and files together, with a live grade estimate."
        wide={{ left: 150, top: 250, width: 760 }}
        subWidth={640}
      />
      <div
        style={{
          position: "absolute",
          display: "flex",
          flexWrap: "wrap",
          gap: 14,
          ...(tall ? { left: 90, right: 90, top: 650 } : { left: 150, top: 700, width: 820 }),
        }}
      >
        {PARTS.map((p) => (
          <Part key={p.label} {...p} />
        ))}
      </div>
      {tall ? (
        <>
          <FloatingDevice screen="grades" width={400} left={610} top={940} at={8} turn={-20} settle={0} lift={0.15} style={{ filter: "brightness(0.96)" }} />
          <FloatingDevice screen="subject" width={470} left={200} top={860} turn={-10} settle={4} />
          <PopCard card="avgGrade" at={54} width={330} left={60} top={1000} />
          <PopCard card="attendance" at={72} width={330} left={690} top={1080} />
          <PopCard card="gradeEstimate" at={150} width={520} left={500} top={1320} />
        </>
      ) : (
        <>
          <FloatingDevice screen="grades" width={360} left={1440} top={150} at={8} turn={-20} settle={0} lift={0.15} style={{ filter: "brightness(0.96)" }} />
          <FloatingDevice screen="subject" width={420} left={1100} top={90} turn={-12} settle={4} />
          <PopCard card="avgGrade" at={54} width={300} left={900} top={240} />
          <PopCard card="attendance" at={72} width={300} left={1520} top={330} />
          <PopCard card="gradeEstimate" at={150} width={470} left={1330} top={640} />
        </>
      )}
    </Stage>
  );
};
