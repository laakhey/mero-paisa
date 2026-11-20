import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { Button, Card, Divider, ListRow, Screen, Text } from '@/components/ui/primitives';
import { listAccounts } from '@/db/repositories';
import { useQuery } from '@/db/store';
import { useSettings } from '@/providers/settings';

export default function AccountsScreen() {
  const router = useRouter();
  const { money } = useSettings();
  const { data: accounts = [] } = useQuery((db) => listAccounts(db));
  const total = accounts.reduce((sum, account) => sum + account.balance, 0);

  return (
    <Screen>
      <Card>
        <Text variant="label" color="textSecondary">
          Total balance
        </Text>
        <Text variant="title" numeric>
          {money(total)}
        </Text>
      </Card>
      <Card style={{ gap: 8 }}>
        {accounts.map((account, index) => (
          <View key={account.id} style={{ gap: 8 }}>
            {index > 0 ? <Divider /> : null}
            <ListRow
              icon={account.icon}
              iconColor={account.color}
              title={account.name}
              value={money(account.balance)}
              onPress={() => router.push({ pathname: '/account', params: { id: account.id } })}
            />
          </View>
        ))}
      </Card>
      <Button title="Add account" icon="add" variant="secondary" onPress={() => router.push('/account')} />
    </Screen>
  );
}
