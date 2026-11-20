import { Redirect, Tabs } from 'expo-router';

import { Icon, type IconName } from '@/components/ui/icon';
import { useSettings } from '@/providers/settings';

const TABS: { name: string; title: string; icon: IconName }[] = [
  { name: 'index', title: 'Home', icon: 'home' },
  { name: 'transactions', title: 'Activity', icon: 'list' },
  { name: 'budgets', title: 'Budgets', icon: 'budget' },
  { name: 'reports', title: 'Reports', icon: 'chart' },
  { name: 'settings', title: 'Settings', icon: 'settings' },
];

export default function TabsLayout() {
  const { colors, onboarded } = useSettings();
  // New installs start with a short setup (currency, starting balances).
  if (!onboarded) return <Redirect href="/welcome" />;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        sceneStyle: { backgroundColor: colors.background },
      }}>
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarIcon: ({ color, size }) => <Icon name={tab.icon} size={size} color={color} />,
          }}
        />
      ))}
    </Tabs>
  );
}
