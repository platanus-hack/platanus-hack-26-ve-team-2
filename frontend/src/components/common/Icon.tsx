import type { ReactNode } from "react";
import Svg, { Circle, Path } from "react-native-svg";

import { colors } from "@/theme";

export type IconName =
  | "search"
  | "locate"
  | "walk"
  | "arrow"
  | "back"
  | "x"
  | "camera"
  | "layers"
  | "nav"
  | "chevron"
  | "sound"
  | "mic";

const paths: Record<IconName, ReactNode> = {
  search: (
    <>
      <Circle cx="11" cy="11" r="7" />
      <Path d="m20 20-4-4" />
    </>
  ),
  locate: (
    <>
      <Circle cx="12" cy="12" r="3" />
      <Path d="M12 2v3m0 14v3M2 12h3m14 0h3" />
      <Circle cx="12" cy="12" r="8" />
    </>
  ),
  walk: (
    <>
      <Circle cx="13" cy="5" r="2" />
      <Path d="m10 22 2-7-3-3 2-4 4 3 3 1m-8 3-4 6m7-6 4 6" />
    </>
  ),
  arrow: <Path d="M5 12h14M13 6l6 6-6 6" />,
  back: <Path d="m15 18-6-6 6-6" />,
  x: <Path d="m6 6 12 12M18 6 6 18" />,
  camera: (
    <>
      <Path d="M14.5 5 13 3h-2L9.5 5H5a2 2 0 0 0-2 2v11h18V7a2 2 0 0 0-2-2Z" />
      <Circle cx="12" cy="12" r="4" />
    </>
  ),
  layers: (
    <>
      <Path d="m12 3 9 5-9 5-9-5 9-5Z" />
      <Path d="m3 12 9 5 9-5M3 16l9 5 9-5" />
    </>
  ),
  nav: <Path d="m12 2 7 19-7-4-7 4 7-19Z" />,
  chevron: <Path d="m9 18 6-6-6-6" />,
  mic: (
    <>
      <Path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z" />
      <Path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </>
  ),
  sound: (
    <>
      <Path d="M11 5 6 9H3v6h3l5 4V5Z" />
      <Path d="M15 9a4 4 0 0 1 0 6m3-9a8 8 0 0 1 0 12" />
    </>
  ),
};

type Props = { name: IconName; size?: number; color?: string };

export function Icon({ name, size = 20, color = colors.ink }: Props) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </Svg>
  );
}
