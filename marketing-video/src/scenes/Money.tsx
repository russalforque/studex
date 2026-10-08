import { Bus, Laptop, Utensils, Wallet } from "lucide-react";
import { interpolate, useCurrentFrame } from "remotion";
import { C } from "../theme";
import { Bar, Card, Headline, Hero, IconCircle, Label, Phone, Rise, Scene } from "../ui";

const EXPENSES = [
  { icon: Utensils, bg: C.peach, ink: C.peachInk, name: "Lunch", cat: "Food", amount: "₱85", at: 40 },
  { icon: Bus, bg: C.sky, ink: C.skyInk, name: "Jeepney", cat: "Transport", amount: "₱26", at: 50 },
];

export const Money: React.FC = () => {
  const frame = useCurrentFrame();
  const safe = Math.round(interpolate(frame, [18, 48], [0, 185], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  const saved = interpolate(frame, [64, 104], [0, 0.64], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <Scene>
      <Headline kicker="Allowance & savings" kickerColor={C.mint} title="Spend smart." sub="See what's safe to spend, every day." />
      <Phone>
        <Rise start={14}>
          <Hero bg={C.mint}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <div>
                <Label color={C.mintInk}>Safe to spend today</Label>
                <div style={{ fontSize: 100, fontWeight: 800, letterSpacing: -3, marginTop: 6, fontVariantNumeric: "tabular-nums" }}>
                  ₱{safe}
                </div>
                <div style={{ fontSize: 28, fontWeight: 600, color: C.ink2 }}>Allowance lasts until Friday</div>
              </div>
              <IconCircle bg="#fff" size={84}>
                <Wallet size={42} color={C.mintInk} />
              </IconCircle>
            </div>
          </Hero>
        </Rise>
        <Rise start={30}>
          <div style={{ fontSize: 34, fontWeight: 800, margin: "32px 0 16px 6px" }}>Today</div>
        </Rise>
        <Card style={{ padding: "8px 28px", opacity: interpolate(frame, [30, 40], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
          {EXPENSES.map((e) => (
            <Rise key={e.name} start={e.at} distance={24}>
              <div style={{ display: "flex", alignItems: "center", gap: 20, padding: "16px 0" }}>
                <IconCircle bg={e.bg}>
                  <e.icon size={32} color={e.ink} />
                </IconCircle>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 32, fontWeight: 700 }}>{e.name}</div>
                  <div style={{ fontSize: 24, fontWeight: 600, color: C.ink2 }}>{e.cat}</div>
                </div>
                <div style={{ fontSize: 34, fontWeight: 800 }}>−{e.amount}</div>
              </div>
            </Rise>
          ))}
        </Card>
        <Rise start={60}>
          <Card style={{ marginTop: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
              <IconCircle bg={C.lilac}>
                <Laptop size={32} color={C.lilacInk} />
              </IconCircle>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 32, fontWeight: 700 }}>New laptop</div>
                <div style={{ fontSize: 24, fontWeight: 600, color: C.ink2, fontVariantNumeric: "tabular-nums" }}>
                  ₱{Math.round(saved * 30000).toLocaleString("en-US")} of ₱30,000
                </div>
              </div>
              <div style={{ fontSize: 34, fontWeight: 800, color: C.lilacInk }}>{Math.round(saved * 100)}%</div>
            </div>
            <div style={{ marginTop: 20 }}>
              <Bar value={saved} color={C.lilacInk} />
            </div>
          </Card>
        </Rise>
      </Phone>
    </Scene>
  );
};
