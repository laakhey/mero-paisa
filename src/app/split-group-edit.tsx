import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Button, Card, Field, IconButton, Input, Screen, Text, hapticSuccess } from '@/components/ui/primitives';
import { confirmDestructive } from '@/components/widgets';
import { deleteSplitGroup, getSplitGroup, saveSplitGroup } from '@/db/split-repositories';
import { space } from '@/theme/tokens';

type Person = { key: string; id?: number; name: string };

let nextKey = 0;
const newPerson = (name = '', id?: number): Person => ({ key: `p${nextKey++}`, id, name });

export default function SplitGroupEditScreen() {
  const router = useRouter();
  const db = useSQLiteContext();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = params.id ? Number(params.id) : undefined;

  const [name, setName] = useState('');
  const [people, setPeople] = useState<Person[]>(() => [newPerson()]);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(id === undefined);

  useEffect(() => {
    if (id === undefined) return;
    getSplitGroup(db, id).then((detail) => {
      if (detail) {
        setName(detail.group.name);
        setPeople(detail.members.filter((m) => !m.isMe).map((m) => newPerson(m.name, m.id)));
      }
      setReady(true);
    });
  }, [db, id]);

  const update = (key: string, value: string) => {
    setPeople((prev) => prev.map((p) => (p.key === key ? { ...p, name: value } : p)));
    setError(null);
  };

  const save = async () => {
    try {
      const groupId = await saveSplitGroup(db, { name, members: people.map(({ id: memberId, name: n }) => ({ id: memberId, name: n })) }, id);
      hapticSuccess();
      // A new group opens straight away so the first bill can be added.
      if (id === undefined) router.replace({ pathname: '/split-group', params: { id: groupId } });
      else router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save. Please try again.');
    }
  };

  const remove = async () => {
    if (id === undefined) return;
    const ok = await confirmDestructive(
      'Delete this group?',
      'The group, its people and all its bills will be deleted. Expenses already added to your own records are kept. This cannot be undone.',
      'Delete'
    );
    if (!ok) return;
    await deleteSplitGroup(db, id);
    router.dismissTo('/split');
  };

  if (!ready) return <Screen />;

  return (
    <Screen>
      <Stack.Screen options={{ title: id === undefined ? 'New group' : 'Edit group' }} />
      <Field label="Group name">
        <Input
          value={name}
          onChangeText={(text) => {
            setName(text);
            setError(null);
          }}
          placeholder="e.g. Pokhara trip, Flat 3B"
          maxLength={40}
          autoFocus={id === undefined}
        />
      </Field>

      <Field label="People" error={error}>
        <Card style={{ gap: space.sm }}>
          <Text variant="bodyStrong">You</Text>
          {people.map((person, index) => (
            <View key={person.key} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
              <Input
                value={person.name}
                onChangeText={(text) => update(person.key, text)}
                placeholder={`Person ${index + 2}`}
                maxLength={30}
                autoCapitalize="words"
                accessibilityLabel={`Name of person ${index + 2}`}
                style={{ flex: 1 }}
              />
              <IconButton
                icon="close"
                label={`Remove ${person.name || `person ${index + 2}`}`}
                onPress={() => setPeople((prev) => prev.filter((p) => p.key !== person.key))}
              />
            </View>
          ))}
          <Button title="Add person" icon="add" variant="ghost" onPress={() => setPeople((prev) => [...prev, newPerson()])} />
        </Card>
        <Text variant="caption" color="textSecondary">
          Just names: they do not need the app or an account.
        </Text>
      </Field>

      <Button title={id === undefined ? 'Create group' : 'Save'} icon="check" onPress={save} />
      {id !== undefined ? <Button title="Delete group" icon="delete" variant="danger" onPress={remove} /> : null}
    </Screen>
  );
}
