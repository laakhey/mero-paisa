import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { View } from 'react-native';

import {
  Button,
  Card,
  Divider,
  EmptyState,
  Field,
  IconButton,
  Input,
  Screen,
  Text,
} from '@/components/ui/primitives';
import { confirmDestructive } from '@/components/widgets';
import { MAX_LABEL_LENGTH, createLabel, deleteLabel, listLabels } from '@/db/repositories';
import { useQuery } from '@/db/store';
import type { Label } from '@/db/types';
import { hitTarget, space } from '@/theme/tokens';

export default function LabelsScreen() {
  const db = useSQLiteContext();
  const { data: labels } = useQuery(listLabels);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const add = async () => {
    try {
      await createLabel(db, name);
      setName('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add the label.');
    }
  };

  const remove = async (label: Label) => {
    const ok = await confirmDestructive(
      `Delete #${label.name}?`,
      'The label is removed from every transaction. The transactions themselves are kept.',
      'Delete'
    );
    if (ok) await deleteLabel(db, label.id);
  };

  return (
    <Screen>
      <Text color="textSecondary">
        Labels cut across categories — tag a trip, a project or anything you want to total up later, then filter by
        it in Activity.
      </Text>

      <Field label="New label" error={error}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <Input
            value={name}
            onChangeText={(text) => {
              setName(text);
              setError(null);
            }}
            placeholder="e.g. vacation"
            maxLength={MAX_LABEL_LENGTH}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={add}
            style={{ flex: 1 }}
          />
          <Button title="Add" disabled={!name.trim()} onPress={add} />
        </View>
      </Field>

      {labels && labels.length === 0 ? (
        <Card>
          <EmptyState icon="tag" title="No labels yet" message="Create one here, or while adding a transaction." />
        </Card>
      ) : null}

      {labels && labels.length > 0 ? (
        <Card style={{ gap: 0, paddingVertical: space.xs }}>
          {labels.map((label, index) => (
            <View key={label.id}>
              {index > 0 ? <Divider /> : null}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: hitTarget + 4 }}>
                <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: label.color }} />
                <Text variant="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>
                  #{label.name}
                </Text>
                <IconButton icon="delete" label={`Delete label ${label.name}`} onPress={() => remove(label)} />
              </View>
            </View>
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}
