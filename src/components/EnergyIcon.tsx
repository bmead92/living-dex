import Svg, { Circle, G, Path, Polygon, Rect } from 'react-native-svg';
import { ENERGY_COLOR, type ColorChip } from '../lib/filter';

const LIGHT = new Set<ColorChip>(['Lightning', 'Colorless', 'Metal']);

function Glyph({ type, fg, bg }: { type: ColorChip; fg: string; bg: string }) {
  switch (type) {
    case 'Grass':
      return (
        <>
          <Path d="M18.5 4.5C11 4.5 5.5 9 5.5 15.5c0 1.4.3 2.6.8 3.6 6.6.4 12.2-4.3 12.2-12.2z" fill={fg} />
          <Path d="M7 18.5 14.5 9.5" stroke={bg} strokeWidth={1.4} strokeLinecap="round" />
        </>
      );
    case 'Fire':
      return (
        <Path
          d="M12 2.5c.8 3.6 5.5 5.6 5.5 11a5.5 5.5 0 0 1-11 0c0-2.9 1.8-4.2 2.6-6.4 1.3 1.4 1.4 3 1.4 4.2 1.6-2.4 1.9-5.4 1.5-8.8z"
          fill={fg}
        />
      );
    case 'Water':
      return <Path d="M12 3s-6.5 7.6-6.5 12a6.5 6.5 0 0 0 13 0C18.5 10.6 12 3 12 3z" fill={fg} />;
    case 'Lightning':
      return <Path d="M13.5 2 5.5 13.2h5.6L9.8 22l8.7-11.6h-5.7z" fill={fg} />;
    case 'Psychic':
      return (
        <>
          <Path d="M2.5 12c4.2-6.3 14.8-6.3 19 0-4.2 6.3-14.8 6.3-19 0z" fill={fg} />
          <Circle cx={12} cy={12} r={3.3} fill={bg} />
        </>
      );
    case 'Fighting':
      return (
        <>
          <Rect x={5.5} y={7.5} width={13} height={11} rx={3.2} fill={fg} />
          <Path d="M9.3 7.8v3.6M12 7.8v3.6M14.7 7.8v3.6M5.8 13.2h5.4" stroke={bg} strokeWidth={1.3} strokeLinecap="round" />
        </>
      );
    case 'Darkness':
      return <Path d="M15 3.2a9 9 0 1 0 5.8 12.4A7.2 7.2 0 0 1 15 3.2z" fill={fg} />;
    case 'Metal':
      return (
        <>
          <Polygon points="12,2.8 20,7.4 20,16.6 12,21.2 4,16.6 4,7.4" fill={fg} />
          <Circle cx={12} cy={12} r={3.6} fill={bg} />
        </>
      );
    case 'Fairy':
      return <Path d="M12 2.5Q13.4 10.6 21.5 12 13.4 13.4 12 21.5 10.6 13.4 2.5 12 10.6 10.6 12 2.5z" fill={fg} />;
    case 'Dragon':
      return (
        <Path d="M6 18.5 13 4.5M9.8 20 16.4 7M13.8 21 19.2 10" stroke={fg} strokeWidth={2.4} strokeLinecap="round" />
      );
    case 'Colorless':
      return (
        <Polygon points="12,2.8 14.3,9 21,9.1 15.7,13.1 17.6,19.6 12,15.8 6.4,19.6 8.3,13.1 3,9.1 9.7,9" fill={fg} />
      );
  }
}

export function EnergyIcon({ type, size = 24 }: { type: ColorChip; size?: number }) {
  const bg = ENERGY_COLOR[type];
  const fg = LIGHT.has(type) ? '#1d1b16' : '#ffffff';
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={12} fill={bg} />
      <G transform="translate(4.2 4.2) scale(0.65)">
        <Glyph type={type} fg={fg} bg={bg} />
      </G>
    </Svg>
  );
}
