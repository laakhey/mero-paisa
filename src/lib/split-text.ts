import type { Transfer } from './split';

type Money = (minor: number) => string;

/** "You are owed Rs 500" / "You owe Rs 500" / "Settled up", with the matching colour token. */
export function myBalanceLabel(balance: number, money: Money) {
  if (balance > 0) return { text: `You are owed ${money(balance)}`, color: 'income' as const };
  if (balance < 0) return { text: `You owe ${money(-balance)}`, color: 'expense' as const };
  return { text: 'Settled up', color: 'textSecondary' as const };
}

/**
 * A plain-text summary to send to the group (WhatsApp, Viber, SMS...), since
 * the other people do not have the app.
 */
export function groupSummaryText(
  groupName: string,
  total: number,
  members: { id: number; name: string }[],
  balances: Map<number, number>,
  transfers: Transfer[],
  money: Money
): string {
  const name = (id: number) => members.find((m) => m.id === id)?.name ?? '?';
  const lines = [`${groupName} — total spent ${money(total)}`, ''];
  if (transfers.length === 0) {
    lines.push('Everyone is settled up.');
  } else {
    lines.push('To settle up:');
    for (const t of transfers) lines.push(`• ${name(t.from)} pays ${name(t.to)} ${money(t.amount)}`);
    lines.push('', 'Balances:');
    for (const m of members) {
      const balance = balances.get(m.id) ?? 0;
      lines.push(`• ${m.name}: ${balance > 0 ? `gets back ${money(balance)}` : balance < 0 ? `owes ${money(-balance)}` : 'settled'}`);
    }
  }
  lines.push('', 'Sent from Mero Paisa');
  return lines.join('\n');
}
