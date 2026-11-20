import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';

import { ColorPicker, IconPicker } from '@/components/pickers';
import { CATEGORY_ICONS, type IconName } from '@/components/ui/icon';
import { Button, Field, Input, Screen, Segmented, Text, hapticSuccess } from '@/components/ui/primitives';
import { confirmDestructive, notify } from '@/components/widgets';
import { getCategory, removeCategory, saveCategory } from '@/db/repositories';
import type { CategoryKind } from '@/db/types';
import { parsePriority } from '@/lib/priorities';
import { swatches } from '@/theme/tokens';

type PriorityChoice = 'need' | 'want' | 'savings' | 'none';

const PRIORITY_OPTIONS: { value: PriorityChoice; label: string }[] = [
  { value: 'need', label: 'Need' },
  { value: 'want', label: 'Want' },
  { value: 'savings', label: 'Savings' },
  { value: 'none', label: 'Not sure' },
];

export default function CategoryScreen() {
  const router = useRouter();
  const db = useSQLiteContext();
  const params = useLocalSearchParams<{ id?: string; kind?: CategoryKind }>();
  const id = params.id ? Number(params.id) : undefined;

  const [kind, setKind] = useState<CategoryKind>(params.kind === 'income' ? 'income' : 'expense');
  const [name, setName] = useState('');
  const [icon, setIcon] = useState<IconName>('tag');
  const [color, setColor] = useState<string>(swatches[4]);
  const [priority, setPriority] = useState<PriorityChoice>('none');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id === undefined) return;
    getCategory(db, id).then((category) => {
      if (!category) return;
      setKind(category.kind);
      setName(category.name);
      setIcon(category.icon);
      setColor(category.color);
      setPriority(category.priority ?? 'none');
    });
  }, [db, id]);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/categories'));

  const save = async () => {
    if (!name.trim()) return setError('Give the category a name.');
    await saveCategory(db, { name, kind, icon, color, priority: parsePriority(priority) }, id);
    hapticSuccess();
    close();
  };

  const remove = async () => {
    if (id === undefined) return;
    const ok = await confirmDestructive(
      'Delete category?',
      'If it has transactions it will be hidden from pickers but kept in your history. Its budget is removed.',
      'Delete'
    );
    if (!ok) return;
    const outcome = await removeCategory(db, id);
    if (outcome === 'archived') notify('Category archived', 'Existing transactions keep this category.');
    close();
  };

  return (
    <Screen>
      <Stack.Screen
        options={{ title: id === undefined ? `New ${kind} category` : 'Edit category' }}
      />
      <Field label="Name" error={error}>
        <Input
          value={name}
          onChangeText={(text) => {
            setName(text);
            setError(null);
          }}
          placeholder="e.g. Coffee"
          maxLength={30}
          autoFocus={id === undefined}
        />
      </Field>
      {kind === 'expense' ? (
        <Field label="What kind of spending?">
          <Segmented options={PRIORITY_OPTIONS} value={priority} onChange={setPriority} />
          <Text variant="caption" color="textSecondary">
            Needs are essentials you would pay for anyway, like rent, groceries and bills. Wants are
            the things you could cut back on. Savings covers money put aside and paying off debt,
            like a loan EMI.
          </Text>
        </Field>
      ) : null}
      <Field label="Colour">
        <ColorPicker value={color} onChange={setColor} />
      </Field>
      <Field label="Icon">
        <IconPicker icons={CATEGORY_ICONS} value={icon} color={color} onChange={setIcon} />
      </Field>
      <Button title="Save category" icon="check" onPress={save} />
      {id !== undefined ? <Button title="Delete category" icon="delete" variant="danger" onPress={remove} /> : null}
    </Screen>
  );
}
