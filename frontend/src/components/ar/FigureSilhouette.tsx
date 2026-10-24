import Svg, { Defs, Ellipse, LinearGradient, Polygon, Stop } from "react-native-svg";

const points =
  "35,0 65,0 72,9 67,19 76,28 84,60 70,64 68,100 48,100 44,67 26,100 10,96 31,57 20,32 34,19 29,8";

type Props = {
  active: boolean;
  /** 0 = boca cerrada, 1 = máxima apertura (lipsync) */
  mouthOpen?: number;
};

// Silueta del personaje histórico (placeholder hasta tener el modelo AR)
export function FigureSilhouette({ active, mouthOpen = 0 }: Props) {
  const width = active ? 118 : 105;
  const height = active ? 280 : 250;
  return (
    <Svg width={width} height={height} viewBox="0 0 100 100" preserveAspectRatio="none" opacity={active ? 1 : 0.82}>
      <Defs>
        <LinearGradient id="figure" x1="0" y1="0" x2="1" y2="0.2">
          <Stop offset="0" stopColor={active ? "#3a2f1e" : "#182118"} stopOpacity={0.91} />
          <Stop offset="1" stopColor={active ? "#8a6440" : "#6d4e34"} stopOpacity={0.87} />
        </LinearGradient>
      </Defs>
      <Polygon points={points} fill="url(#figure)" />
      {mouthOpen > 0 && <Ellipse cx={50} cy={13} rx={5} ry={0.4 + mouthOpen * 2.2} fill="#f3d3a8" opacity={0.9} />}
    </Svg>
  );
}
