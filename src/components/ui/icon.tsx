import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import type { ColorValue, StyleProp, ViewStyle } from 'react-native';

type PlatformSymbol = Exclude<SymbolViewProps['name'], string>;

/**
 * Semantic icon names mapped to SF Symbols (iOS) and Material Symbols
 * (Android, web). Category and account icons are stored in the database by
 * these keys, so never rename or remove one — only add.
 */
const ICONS = {
  // Navigation & actions
  home: { ios: 'house.fill', android: 'home', web: 'home' },
  list: { ios: 'list.bullet.rectangle.fill', android: 'receipt_long', web: 'receipt_long' },
  budget: { ios: 'chart.pie.fill', android: 'pie_chart', web: 'pie_chart' },
  chart: { ios: 'chart.bar.fill', android: 'bar_chart', web: 'bar_chart' },
  settings: { ios: 'gearshape.fill', android: 'settings', web: 'settings' },
  add: { ios: 'plus', android: 'add', web: 'add' },
  close: { ios: 'xmark', android: 'close', web: 'close' },
  check: { ios: 'checkmark', android: 'check', web: 'check' },
  back: { ios: 'chevron.left', android: 'chevron_left', web: 'chevron_left' },
  forward: { ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' },
  search: { ios: 'magnifyingglass', android: 'search', web: 'search' },
  delete: { ios: 'trash', android: 'delete', web: 'delete' },
  edit: { ios: 'pencil', android: 'edit', web: 'edit' },
  calendar: { ios: 'calendar', android: 'calendar_today', web: 'calendar_today' },
  transfer: { ios: 'arrow.left.arrow.right', android: 'swap_horiz', web: 'swap_horiz' },
  up: { ios: 'arrow.up', android: 'arrow_upward', web: 'arrow_upward' },
  down: { ios: 'arrow.down', android: 'arrow_downward', web: 'arrow_downward' },
  lock: { ios: 'lock.fill', android: 'lock', web: 'lock' },
  download: { ios: 'square.and.arrow.up', android: 'download', web: 'download' },
  upload: { ios: 'square.and.arrow.down', android: 'upload', web: 'upload' },
  checkboxOn: { ios: 'checkmark.square.fill', android: 'check_box', web: 'check_box' },
  checkboxOff: { ios: 'square', android: 'check_box_outline_blank', web: 'check_box_outline_blank' },
  group: { ios: 'person.2.fill', android: 'group', web: 'group' },
  person: { ios: 'person.fill', android: 'person', web: 'person' },
  share: { ios: 'square.and.arrow.up', android: 'share', web: 'share' },
  cloud: { ios: 'icloud.fill', android: 'cloud', web: 'cloud' },
  sync: { ios: 'arrow.triangle.2.circlepath', android: 'sync', web: 'sync' },
  logout: { ios: 'rectangle.portrait.and.arrow.right', android: 'logout', web: 'logout' },
  backup: { ios: 'externaldrive.fill.badge.checkmark', android: 'backup', web: 'backup' },
  restore: { ios: 'clock.arrow.circlepath', android: 'settings_backup_restore', web: 'settings_backup_restore' },
  palette: { ios: 'paintpalette.fill', android: 'palette', web: 'palette' },
  category: { ios: 'square.grid.2x2.fill', android: 'category', web: 'category' },
  info: { ios: 'info.circle', android: 'info', web: 'info' },
  warning: { ios: 'exclamationmark.triangle.fill', android: 'warning', web: 'warning' },
  currency: { ios: 'dollarsign.circle.fill', android: 'attach_money', web: 'attach_money' },
  // Categories
  cart: { ios: 'cart.fill', android: 'shopping_cart', web: 'shopping_cart' },
  restaurant: { ios: 'fork.knife', android: 'restaurant', web: 'restaurant' },
  cafe: { ios: 'cup.and.saucer.fill', android: 'local_cafe', web: 'local_cafe' },
  car: { ios: 'car.fill', android: 'directions_car', web: 'directions_car' },
  house: { ios: 'building.2.fill', android: 'home_work', web: 'home_work' },
  bolt: { ios: 'bolt.fill', android: 'bolt', web: 'bolt' },
  bag: { ios: 'bag.fill', android: 'shopping_bag', web: 'shopping_bag' },
  clothing: { ios: 'tshirt.fill', android: 'checkroom', web: 'checkroom' },
  health: { ios: 'cross.case.fill', android: 'medical_services', web: 'medical_services' },
  fitness: { ios: 'dumbbell.fill', android: 'fitness_center', web: 'fitness_center' },
  movie: { ios: 'film.fill', android: 'movie', web: 'movie' },
  subscriptions: { ios: 'play.rectangle.on.rectangle.fill', android: 'subscriptions', web: 'subscriptions' },
  phone: { ios: 'iphone', android: 'phone_iphone', web: 'phone_iphone' },
  school: { ios: 'graduationcap.fill', android: 'school', web: 'school' },
  flight: { ios: 'airplane', android: 'flight', web: 'flight' },
  pets: { ios: 'pawprint.fill', android: 'pets', web: 'pets' },
  heart: { ios: 'heart.fill', android: 'favorite', web: 'favorite' },
  gift: { ios: 'gift.fill', android: 'redeem', web: 'redeem' },
  tag: { ios: 'tag.fill', android: 'sell', web: 'sell' },
  work: { ios: 'briefcase.fill', android: 'work', web: 'work' },
  payments: { ios: 'banknote.fill', android: 'payments', web: 'payments' },
  trending: { ios: 'chart.line.uptrend.xyaxis', android: 'trending_up', web: 'trending_up' },
  // Accounts
  cash: { ios: 'banknote.fill', android: 'payments', web: 'payments' },
  bank: { ios: 'building.columns.fill', android: 'account_balance', web: 'account_balance' },
  card: { ios: 'creditcard.fill', android: 'credit_card', web: 'credit_card' },
  wallet: { ios: 'wallet.pass.fill', android: 'account_balance_wallet', web: 'account_balance_wallet' },
  savings: { ios: 'lock.shield.fill', android: 'savings', web: 'savings' },
} as const satisfies Record<string, PlatformSymbol>;

export type IconName = keyof typeof ICONS;

export const CATEGORY_ICONS: IconName[] = [
  'cart', 'restaurant', 'cafe', 'car', 'house', 'bolt', 'bag', 'clothing', 'health', 'fitness',
  'movie', 'subscriptions', 'phone', 'school', 'flight', 'pets', 'heart', 'gift', 'work',
  'payments', 'trending', 'tag',
];

type Props = {
  name: IconName;
  size?: number;
  color: ColorValue;
  style?: StyleProp<ViewStyle>;
};

export function Icon({ name, size = 22, color, style }: Props) {
  // Unknown keys can only come from a database written by a newer app version.
  const symbol = ICONS[name] ?? ICONS.tag;
  return <SymbolView name={symbol} size={size} tintColor={color} style={style} />;
}
