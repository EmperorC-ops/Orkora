import React, { ReactNode } from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { colors } from '@orkora/theme';

export interface CardProps {
  children: ReactNode;
  style?: ViewStyle;
  padded?: boolean;
}

export const Card: React.FC<CardProps> = ({ children, style, padded = true }) => (
  <View style={[styles.card, padded && styles.padded, style]}>{children}</View>
);

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    marginBottom: 12,
  },
  padded: {
    padding: 16,
  },
});
