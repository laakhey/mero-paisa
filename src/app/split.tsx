import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import { Button, Card, EmptyState, IconBadge, Screen, Text } from '@/components/ui/primitives';
import { listSplitGroups } from '@/db/split-repositories';
import { useQuery } from '@/db/store';
import { myBalanceLabel } from '@/lib/split-text';
import { useSettings } from '@/providers/settings';
import { space } from '@/theme/tokens';

export default function SplitGroupsScreen() {
  const router = useRouter();
  const { money } = useSettings();
  const { data: groups } = useQuery(listSplitGroups);

  const owed = groups?.reduce((sum, g) => sum + Math.max(0, g.myBalance), 0) ?? 0;
  const owe = groups?.reduce((sum, g) => sum + Math.max(0, -g.myBalance), 0) ?? 0;

  return (
    <Screen>
      {groups && groups.length === 0 ? (
        <Card>
          <EmptyState
            icon="group"
            title="Split bills with friends"
            message="Make a group for a trip, a flat or a dinner. Add who paid for what, and see who owes whom. Your friends do not need the app."
            actionLabel="Create a group"
            onAction={() => router.push('/split-group-edit')}
          />
        </Card>
      ) : null}

      {groups && groups.length > 0 ? (
        <>
          <Card>
            <View style={{ flexDirection: 'row', gap: space.lg }}>
              <View style={{ flex: 1 }}>
                <Text variant="label" color="textSecondary">
                  You are owed
                </Text>
                <Text variant="heading" color="income" numeric numberOfLines={1} adjustsFontSizeToFit>
                  {money(owed)}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="label" color="textSecondary">
                  You owe
                </Text>
                <Text variant="heading" color={owe > 0 ? 'expense' : 'text'} numeric numberOfLines={1} adjustsFontSizeToFit>
                  {money(owe)}
                </Text>
              </View>
            </View>
          </Card>

          {groups.map((group) => {
            const label = myBalanceLabel(group.myBalance, money);
            return (
              <Pressable
                key={group.id}
                accessibilityRole="button"
                accessibilityLabel={`${group.name}. ${label.text}. Open`}
                onPress={() => router.push({ pathname: '/split-group', params: { id: group.id } })}
                style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
                <Card>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                    <IconBadge icon="group" color={group.color} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text variant="bodyStrong" numberOfLines={1}>
                        {group.name}
                      </Text>
                      <Text variant="caption" color="textSecondary">
                        {group.memberCount} people · {group.expenseCount} bill{group.expenseCount === 1 ? '' : 's'}
                      </Text>
                    </View>
                    <Text variant="label" color={label.color} numeric>
                      {label.text}
                    </Text>
                  </View>
                </Card>
              </Pressable>
            );
          })}
          <Button title="New group" icon="add" variant="secondary" onPress={() => router.push('/split-group-edit')} />
        </>
      ) : null}
    </Screen>
  );
}
