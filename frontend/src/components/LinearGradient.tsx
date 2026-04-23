import React, { PropsWithChildren } from 'react';
import { StyleProp, View, ViewProps, ViewStyle } from 'react-native';

type Props = PropsWithChildren<
  ViewProps & {
    colors?: readonly string[];
    start?: { x: number; y: number };
    end?: { x: number; y: number };
    locations?: readonly number[];
    style?: StyleProp<ViewStyle>;
  }
>;

const HEX_COLOR = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

const normalizeHex = (color: string) => {
  const value = color.trim();
  if (!HEX_COLOR.test(value)) return null;
  if (value.length === 4) {
    return `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`.toUpperCase();
  }
  return value.toUpperCase();
};

const blendColors = (palette: readonly string[]) => {
  const validColors = palette
    .map(normalizeHex)
    .filter((value): value is string => Boolean(value));

  if (validColors.length === 0) {
    return palette[0] ?? 'transparent';
  }

  const totals = validColors.reduce(
    (acc, color) => {
      acc.r += parseInt(color.slice(1, 3), 16);
      acc.g += parseInt(color.slice(3, 5), 16);
      acc.b += parseInt(color.slice(5, 7), 16);
      return acc;
    },
    { r: 0, g: 0, b: 0 }
  );

  const toHex = (value: number) =>
    Math.round(value / validColors.length)
      .toString(16)
      .padStart(2, '0')
      .toUpperCase();

  return `#${toHex(totals.r)}${toHex(totals.g)}${toHex(totals.b)}`;
};

export const LinearGradient = ({
  colors = [],
  style,
  children,
  start: _start,
  end: _end,
  locations: _locations,
  ...props
}: Props) => (
  <View
    {...props}
    style={[
      style,
      {
        backgroundColor: blendColors(colors),
      },
    ]}
  >
    {children}
  </View>
);
