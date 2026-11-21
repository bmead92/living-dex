import { Image } from 'expo-image';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getSet } from '../lib/catalog';
import { allPrintings, cardImage, cardNumber, cardsByIds, type Card } from '../lib/cards';
import { defaultFinish } from '../lib/identify';
import { formatCents } from '../lib/pricing';
import { headlinePrice, quoteFor } from '../lib/prices';
import { fold } from '../lib/setList';
import { colors } from './theme';

interface Props {
  visible: boolean;
  card: Card | null;
  onSelect: (card: Card) => void;
  onClose: () => void;
}

export function searchPrintings(prints: Card[], query: string): Card[] {
  const words = fold(query).trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return prints;
  return prints.filter((c) => {
    const text = fold(`${c.set_name} ${getSet(c.set)?.serie ?? ''}`).split(/\s+/).filter(Boolean);
    const exact = [c.set.toLowerCase(), (c.set_code ?? '').toLowerCase(), c.collector_number.toLowerCase(), c.released_at.slice(0, 4)];
    return words.every((w) => exact.includes(w) || text.some((t) => t.startsWith(w)));
  });
}

export function PrintingPicker({ visible, card, onSelect, onClose }: Props) {
  const [prints, setPrints] = useState<Card[] | null>(null);
  const [full, setFull] = useState<Map<string, Card>>(new Map());
  const [query, setQuery] = useState('');
  const insets = useSafeAreaInsets();
  const name = card?.name ?? null;

  useEffect(() => {
    if (!visible || !name) return;
    let cancelled = false;
    allPrintings({ name }).then((all) => {
      if (cancelled) return;
      setPrints(all);
      cardsByIds(all.map((p) => p.id).slice(0, 60))
        .then((cards) => !cancelled && setFull(new Map(cards.map((c) => [c.id, c]))))
        .catch(() => {});
    });
    return () => {
      cancelled = true;
    };
  }, [visible, name]);

  const close = () => {
    setQuery('');
    onClose();
  };
  const select = (c: Card) => {
    setQuery('');
    onSelect(full.get(c.id) ?? c);
  };

  const shown = useMemo(() => searchPrintings(prints ?? [], query), [prints, query]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close}>
      <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
        <View style={styles.header}>
          <Text style={styles.title}>Pick printing</Text>
          <Pressable onPress={close} hitSlop={12}>
            <Text style={styles.link}>Done</Text>
          </Pressable>
        </View>
        {!prints ? (
          <ActivityIndicator color={colors.text} style={{ marginTop: 40 }} />
        ) : (
          <FlatList
            data={shown}
            extraData={full}
            keyExtractor={(p) => p.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ padding: 12, gap: 8, paddingBottom: insets.bottom + 12 }}
            ListHeaderComponent={
              prints.length > 6 ? (
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder={`Search ${prints.length} printings`}
                  placeholderTextColor={colors.textMuted}
                  style={styles.input}
                  autoCorrect={false}
                  returnKeyType="search"
                />
              ) : undefined
            }
            ListEmptyComponent={<Text style={styles.empty}>No printing matches.</Text>}
            renderItem={({ item }) => {
              const c = full.get(item.id);
              const price = c ? headlinePrice(quoteFor(c, defaultFinish(c))) : null;
              const set = getSet(item.set);
              return (
                <Pressable
                  style={[styles.item, item.id === card?.id && { borderColor: colors.accent }]}
                  onPress={() => select(item)}
                >
                  <Image source={{ uri: cardImage(c ?? item, 'small') ?? undefined }} style={styles.thumb} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={styles.setName} numberOfLines={1}>
                      {item.set_name}
                    </Text>
                    <Text style={styles.muted}>
                      {cardNumber(item, item.official)} · {item.released_at.slice(0, 4)}
                      {set?.serie ? ` · ${set.serie}` : ''}
                    </Text>
                  </View>
                  <Text style={styles.price}>{c ? formatCents(price) : ''}</Text>
                </Pressable>
              );
            }}
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16 },
  title: { color: colors.text, fontSize: 20, fontWeight: '700' },
  link: { color: colors.accent, fontWeight: '600' },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  thumb: { width: 48, height: 67, borderRadius: 4, backgroundColor: colors.surfaceHigh },
  setName: { flexShrink: 1, color: colors.text },
  input: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    marginBottom: 4,
  },
  empty: { color: colors.textMuted, textAlign: 'center', marginTop: 24 },
  muted: { color: colors.textMuted },
  price: { color: colors.price, fontWeight: '700' },
});
