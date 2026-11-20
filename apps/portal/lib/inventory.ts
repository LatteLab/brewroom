import type { Configuration } from './validations/pos';
import type { IngredientCondition } from './validations/inventory';

export type StockStatus = 'Out' | 'Low' | 'OK';
export function stockStatus(item: { onHand: number; lowAt: number }): StockStatus {
  if (item.onHand <= 0) return 'Out';
  return item.onHand < item.lowAt ? 'Low' : 'OK';
}

export function ingredientApplies(condition: IngredientCondition, configuration: Configuration) {
  switch (condition) {
    case 'always': return true;
    case 'hot': return configuration.temperature === 'Hot';
    case 'iced': return configuration.temperature === 'Iced';
    case 'whole': return configuration.milk === 'Whole';
    case 'oat': return configuration.milk === 'Oat';
  }
}

type UsageLog = { menuItemId: string; drinkName: string; configuration: Configuration; quantity: number };
type UsageIngredient = { menuItemId: string; itemId: string; quantity: number; appliesWhen: IngredientCondition; scalesWithSyrup: boolean };

/** Estimates supply use from valid logs. Drinks with no ingredient lines are reported, not guessed. */
export function estimateUsage(logs: UsageLog[], ingredients: UsageIngredient[]) {
  const byDrink = new Map<string, UsageIngredient[]>();
  for (const line of ingredients) byDrink.set(line.menuItemId, [...(byDrink.get(line.menuItemId) ?? []), line]);
  const used = new Map<string, number>();
  const missing = new Map<string, number>();
  for (const log of logs) {
    const lines = byDrink.get(log.menuItemId);
    if (!lines?.length) { missing.set(log.drinkName, (missing.get(log.drinkName) ?? 0) + log.quantity); continue; }
    for (const line of lines) {
      if (!ingredientApplies(line.appliesWhen, log.configuration)) continue;
      const amount = log.quantity * line.quantity * (line.scalesWithSyrup ? log.configuration.syrup / 100 : 1);
      used.set(line.itemId, (used.get(line.itemId) ?? 0) + amount);
    }
  }
  return {
    used,
    drinksWithoutIngredients: [...missing.entries()].map(([name, drinks]) => ({ name, drinks })).sort((a, b) => b.drinks - a.drinks),
  };
}

export function formatAmount(value: number, unit: string) {
  return `${Number(value.toFixed(2)).toLocaleString()} ${unit}`;
}
