import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { searchNames } from '../lib/catalog';
import { colors } from './theme';

interface Props {
  initial: string;
  onPick: (name: string) => void;
}

export function NameSearch({ initial, onPick }: Props) {
  const [query, setQuery] = useState(initial);
  const [touched, setTouched] = useState(false);
  const results = useMemo(() => (touched ? searchNames(query, 12) : []), [query, touched]);

  const pick = (name: string) => {
    setTouched(false);
    setQuery(name);
    onPick(name);
  };

  return (
    <View style={{ gap: 6 }}>
      <TextInput
        value={query}
        onChangeText={(t) => {
          setQuery(t);
          setTouched(true);
        }}
        onSubmitEditing={() => {
          const exact = results.find((n) => n.toLowerCase() === query.trim().toLowerCase());
          if (exact || results.length === 1) pick(exact ?? results[0]);
        }}
        placeholder="Card name"
        placeholderTextColor={colors.textMuted}
        style={styles.input}
        autoCorrect={false}
        returnKeyType="search"
      />
      {touched && query.trim().length > 0 && (
        <View style={styles.list}>
          {results.length === 0 ? (
            <Text style={styles.empty}>No card names match.</Text>
          ) : (
            results.map((n, i) => (
              <Pressable
                key={n}
                onPress={() => pick(n)}
                style={({ pressed }) => [styles.row, i > 0 && styles.divider, pressed && { backgroundColor: colors.surfaceHigh }]}
              >
                <Text style={styles.name}>{n}</Text>
              </Pressable>
            ))
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    backgroundColor: colors.bg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  list: { borderRadius: 10, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  row: { paddingHorizontal: 12, paddingVertical: 11 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  name: { color: colors.text, fontSize: 15 },
  empty: { color: colors.textMuted, padding: 12 },
});
