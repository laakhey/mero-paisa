import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { ColorPicker } from '@/components/pickers';
import type { IconName } from '@/components/ui/icon';
import { Button, Chip, Field, Input, Screen, hapticSuccess } from '@/components/ui/primitives';
import { confirmDestructive, notify } from '@/components/widgets';
import { getAccount, listAccounts, removeAccount, saveAccount } from '@/db/repositories';
import type { AccountType } from '@/db/types';
import { parseAmount, toInputString } from '@/lib/money';
import { useSettings } from '@/providers/settings';
import { space, swatches } from '@/theme/tokens';

const TYPES: { value: AccountType; label: string; icon: IconName }[] = [
  { value: 'cash', label: 'Cash', icon: 'cash' },
  { value: 'bank', label: 'Bank', icon: 'bank' },
  { value: 'card', label: 'Card', icon: 'card' },
  { value: 'wallet', label: 'Wallet', icon: 'wallet' },
  { value: 'savings', label: 'Savings', icon: 'savings' },
];

export default function AccountScreen() {
  const router = useRouter();
  const db = useSQLiteContext();
  const { currency } = useSettings();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = params.id ? Number(params.id) : undefined;

  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('bank');
  const [color, setColor] = useState<string>(swatches[3]);
  const [openingText, setOpeningText] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id === undefined) return;
    getAccount(db, id).then((account) => {
      if (!account) return;
      setName(account.name);
      setType(account.type);
      setColor(account.color);
      setOpeningText(
        account.openingBalance === 0
          ? ''
          : `${account.openingBalance < 0 ? '-' : ''}${toInputString(account.openingBalance, currency)}`
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, id]);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/accounts'));

  const save = async () => {
    if (!name.trim()) return setError('Give the account a name.');
    // Opening balances may be negative (e.g. a credit card that already carries debt).
    const trimmed = openingText.trim();
    const negative = trimmed.startsWith('-');
    const magnitude = trimmed === '' ? 0 : parseAmount(negative ? trimmed.slice(1) : trimmed, currency);
    if (magnitude === null) return setError('Enter a valid opening balance.');
    const icon = TYPES.find((t) => t.value === type)?.icon ?? 'bank';
    await saveAccount(db, { name, type, icon, color, openingBalance: negative ? -magnitude : magnitude }, id);
    hapticSuccess();
    close();
  };

  const remove = async () => {
    if (id === undefined) return;
    if ((await listAccounts(db)).length <= 1) {
      return notify('Cannot delete', 'Keep at least one account to record transactions.');
    }
    const ok = await confirmDestructive(
      'Delete account?',
      'If it has transactions it will be archived: hidden and excluded from your total balance, with history kept.',
      'Delete'
    );
    if (!ok) return;
    const outcome = await removeAccount(db, id);
    if (outcome === 'archived') notify('Account archived', 'Its transactions remain in your history.');
    close();
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: id === undefined ? 'New account' : 'Edit account' }} />
      <Field label="Name">
        <Input
          value={name}
          onChangeText={(text) => {
            setName(text);
            setError(null);
          }}
          placeholder="e.g. Everyday account"
          maxLength={30}
          autoFocus={id === undefined}
        />
      </Field>
      <Field label="Type">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {TYPES.map((option) => (
            <Chip
              key={option.value}
              label={option.label}
              icon={option.icon}
              tint={color}
              selected={option.value === type}
              onPress={() => setType(option.value)}
            />
          ))}
        </View>
      </Field>
      <Field label="Colour">
        <ColorPicker value={color} onChange={setColor} />
      </Field>
      <Field label={`Opening balance (${currency})`} error={error}>
        <Input
          value={openingText}
          onChangeText={(text) => {
            setOpeningText(text.replace(',', '.'));
            setError(null);
          }}
          placeholder="0"
          keyboardType="numbers-and-punctuation"
        />
      </Field>
      <Button title="Save account" icon="check" onPress={save} />
      {id !== undefined ? <Button title="Delete account" icon="delete" variant="danger" onPress={remove} /> : null}
    </Screen>
  );
}
