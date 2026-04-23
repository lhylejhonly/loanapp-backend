import React, { useEffect, useMemo, useState } from 'react';
import {
  Image,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { colors } from '../../constants/theme';

type UserAvatarProps = {
  name?: string;
  photoUrl?: string;
  size?: number;
  borderWidth?: number;
  borderColor?: string;
  backgroundColor?: string;
  textColor?: string;
  textSize?: number;
  containerStyle?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
};

const getInitials = (name?: string) => {
  const parts = (name ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length === 0) {
    return 'LA';
  }

  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('');
};

export const UserAvatar = ({
  name,
  photoUrl,
  size = 44,
  borderWidth = 0,
  borderColor = 'transparent',
  backgroundColor = colors.primarySoft,
  textColor = colors.primary,
  textSize,
  containerStyle,
  textStyle,
}: UserAvatarProps) => {
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [photoUrl]);

  const initials = useMemo(() => getInitials(name), [name]);
  const resolvedTextSize = textSize ?? Math.max(14, Math.round(size * 0.36));

  return (
    <View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth,
          borderColor,
          backgroundColor,
        },
        containerStyle,
      ]}
    >
      {photoUrl && !imageFailed ? (
        <Image
          source={{ uri: photoUrl }}
          style={[styles.image, { borderRadius: size / 2 }]}
          onError={() => setImageFailed(true)}
        />
      ) : (
        <Text style={[styles.text, { color: textColor, fontSize: resolvedTextSize }, textStyle]}>
          {initials}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  text: {
    fontWeight: '800',
    letterSpacing: 0.2,
  },
});
