import { Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { EASE, F, FloatingDevice, PopCard, Stage, TextBlock, useEnter, useTall } from "../kit";
import { scene } from "../timeline";

const { duration } = scene("files");
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** A photographed handout: scanned, then filed into the phone. */
const Handout: React.FC<{ left: number; top: number; width: number; into: [number, number] }> = ({ left, top, width, into }) => {
  const frame = useCurrentFrame();
  const enter = useEnter(6, 30);
  const scan = interpolate(frame, [28, 74], [0, 1], { ...clamp, easing: EASE });
  const flash = interpolate(frame, [74, 77, 88], [0, 0.9, 0], clamp);
  const file = interpolate(frame, [84, 108], [0, 1], { ...clamp, easing: EASE });
  const height = width * (1754 / 1240);
  return (
    <div
      style={{
        position: "absolute",
        left: left + file * into[0],
        top: top + (1 - enter) * 80 + file * into[1],
        width,
        height,
        rotate: `${-4 + file * 4}deg`,
        scale: String(1 - file * 0.75),
        opacity: enter * (1 - file),
        filter: `blur(${(1 - enter) * 10}px)`,
        boxShadow: "0 40px 80px -30px rgb(8 12 30 / 0.45)",
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      <Img src={staticFile("screens/handout.jpg")} style={{ width: "100%", height: "100%" }} />
      {/* Scan beam */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: `${scan * 100}%`,
          height: 6,
          background: F.brandSoft,
          boxShadow: `0 0 40px 14px ${F.brandSoft}`,
          opacity: scan > 0 && scan < 1 ? 1 : 0,
        }}
      />
      {/* Scanned area gets a crisp blue tint */}
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: `${scan * 100}%`, background: "rgb(20 99 255 / 0.06)" }} />
      <div style={{ position: "absolute", inset: 0, background: "#fff", opacity: flash }} />
    </div>
  );
};

export const Files: React.FC = () => {
  const tall = useTall();
  return (
    <Stage duration={duration}>
      <TextBlock
        kicker="Study files"
        title={"Your notes,\nalways with you."}
        sub="Scan handouts into clean PDFs or import your files. Everything opens offline."
        wide={{ left: 150, top: 300, width: 860 }}
        subWidth={720}
      />
      {tall ? (
        <>
          <FloatingDevice screen="files" width={470} left={305} top={830} at={40} turn={-8} settle={3} />
          <Handout left={130} top={820} width={560} into={[250, 300]} />
          <PopCard card="recentFiles" at={104} width={600} left={60} top={1330} />
        </>
      ) : (
        <>
          <FloatingDevice screen="files" width={420} left={1170} top={90} at={40} />
          <Handout left={860} top={130} width={470} into={[400, 200]} />
          <PopCard card="recentFiles" at={104} width={520} left={900} top={600} />
        </>
      )}
    </Stage>
  );
};
