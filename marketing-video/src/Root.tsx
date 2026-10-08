import { Composition, Folder } from "remotion";
import { Exams } from "./scenes/Exams";
import { Files } from "./scenes/Files";
import { Hook } from "./scenes/Hook";
import { Intro } from "./scenes/Intro";
import { Money } from "./scenes/Money";
import { Outro } from "./scenes/Outro";
import { Privacy } from "./scenes/Privacy";
import { Schedule } from "./scenes/Schedule";
import { StudexPromo } from "./StudexPromo";
import "./theme";

// Vertical 9:16 for Reels, TikTok, Stories and Shorts.
const SIZE = { width: 1080, height: 1920, fps: 30 } as const;

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="StudexPromo" component={StudexPromo} durationInFrames={750} {...SIZE} />
    <Folder name="Scenes">
      <Composition id="Hook" component={Hook} durationInFrames={95} {...SIZE} />
      <Composition id="Intro" component={Intro} durationInFrames={80} {...SIZE} />
      <Composition id="Schedule" component={Schedule} durationInFrames={120} {...SIZE} />
      <Composition id="Exams" component={Exams} durationInFrames={110} {...SIZE} />
      <Composition id="Money" component={Money} durationInFrames={125} {...SIZE} />
      <Composition id="Files" component={Files} durationInFrames={105} {...SIZE} />
      <Composition id="Privacy" component={Privacy} durationInFrames={100} {...SIZE} />
      <Composition id="Outro" component={Outro} durationInFrames={120} {...SIZE} />
    </Folder>
  </>
);
