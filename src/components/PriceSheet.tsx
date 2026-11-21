import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatCents } from '../lib/pricing';
import { parseDollars } from '../lib/sources';
import { colors, sheetWidth } from './theme';

interface Props {
  name: string;
  current: number | null;
  locked: boolean;
  onSave: (cents: number | null) => void;
  onClose: () => void;
}

export function PriceSheet({ name, current, locked, onSave, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [price, setPrice] = useState(current != null ? (current / 100).toFixed(2) : '');
  const cents = parseDollars(price);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <Pressable style={styles.backdrop} onPress={onClose}>
          <Pressable style={[styles.sheet, sheetWidth, { paddingBottom: insets.bottom + 12 }]} onPress={() => {}}>
            <View style={styles.handle} />
            <Text style={styles.title}>Your price for {name}</Text>
            <Text style={styles.subtitle}>Kept when prices refresh. Each copy.</Text>
            <TextInput
              value={price}
              onChangeText={setPrice}
              placeholder="0.00"
              placeholderTextColor={colors.textMuted}
              keyboardType="decimal-pad"
              selectTextOnFocus
              autoFocus
              style={[styles.input, cents == null && styles.inputBad]}
            />
            <View style={styles.buttons}>
              {locked ? (
                <Pressable style={styles.secondary} onPress={() => onSave(null)}>
                  <Text style={styles.secondaryText}>Use market price</Text>
                </Pressable>
              ) : (
                <Pressable style={styles.secondary} onPress={onClose}>
                  <Text style={styles.secondaryText}>Cancel</Text>
                </Pressable>
              )}
              <Pressable
                style={[styles.primary, cents == null && { opacity: 0.5 }]}
                disabled={cents == null}
                onPress={() => cents != null && onSave(cents)}
              >
                <Text style={styles.primaryText}>Save {cents == null ? '' : formatCents(cents)}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 14,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border },
  title: { color: colors.text, fontSize: 18, fontWeight: '700' },
  subtitle: { color: colors.textMuted, fontSize: 13, marginTop: -10 },
  input: {
    backgroundColor: colors.bg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 18,
  },
  inputBad: { borderColor: colors.danger },
  buttons: { flexDirection: 'row', gap: 10 },
  secondary: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  secondaryText: { color: colors.text, fontWeight: '600' },
  primary: { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: colors.accent, alignItems: 'center' },
  primaryText: { color: '#fff', fontWeight: '800' },
});
