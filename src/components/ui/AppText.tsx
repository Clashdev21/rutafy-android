import { Text, type StyleProp, type TextStyle } from 'react-native';

import { typography, type TypographyVariant } from '@/theme/typography';

type Props = {
  variant?: TypographyVariant;
  children: React.ReactNode;
  style?: StyleProp<TextStyle>;
  color?: string;
  numberOfLines?: number;
};

export function AppText({
  variant = 'body',
  children,
  style,
  color,
  numberOfLines,
}: Props) {
  return (
    <Text
      style={[typography[variant], color ? { color } : null, style]}
      numberOfLines={numberOfLines}>
      {children}
    </Text>
  );
}
