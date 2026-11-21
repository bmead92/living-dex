import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from './theme';

interface Props<T extends string> {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  labels?: Partial<Record<T, string>>;
}

export function Segmented<T extends string>({ options, value, onChange, labels }: Props<T>) {
  const wrap = options.length > 3;
  return (
    <View style={[styles.row, wrap && styles.wrapRow]}>
      {options.map((o) => {
        const active = o === value;
        return (
          <Pressable key={o} onPress={() => onChange(o)} style={[styles.item, wrap && styles.wrapItem, active && styles.active]}>
            <Text style={[styles.label, active && styles.activeLabel]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{labels?.[o] ?? o}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 3,
    borderWidth: 1,
    borderColor: colors.border,
  },
  item: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  wrapRow: { flexWrap: 'wrap', gap: 4 },
  wrapItem: { flex: 0, flexGrow: 1, paddingHorizontal: 12 },
  active: { backgroundColor: colors.accent },
  label: { color: colors.textMuted, fontWeight: '600' },
  activeLabel: { color: '#fff' },
});
