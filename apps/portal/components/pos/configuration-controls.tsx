'use client';

import type { Configuration, MenuOptions } from '@/lib/validations/pos';
import styles from './pos.module.css';

function Choice<T extends string | number>({ label, value, choices, onChange, suffix = '' }: { label: string; value: T; choices: readonly T[]; onChange: (value: T) => void; suffix?: string }) {
  return <fieldset className={styles.optionGroup}><legend>{label}</legend><div className={styles.choices}>{choices.map(choice => <button type="button" key={choice} aria-pressed={value === choice} className={value === choice ? styles.selected : ''} onClick={() => onChange(choice)}>{choice}{suffix}</button>)}</div></fieldset>;
}
export function ConfigurationControls({ value, options, onChange }: { value: Configuration; options: MenuOptions; onChange: (value: Configuration) => void }) {
  return <>
    <Choice label="Temperature" value={value.temperature} choices={options.temperatures} onChange={temperature => onChange(temperature === 'Hot' ? { temperature, milk: value.milk, syrup: value.syrup } : { temperature, milk: value.milk, syrup: value.syrup, ice: value.temperature === 'Iced' ? value.ice : options.defaults.temperature === 'Iced' ? options.defaults.ice : options.iceLevels[0] ?? 'Full' })} />
    <Choice label="Milk" value={value.milk} choices={options.milks} onChange={milk => onChange({ ...value, milk })} />
    <Choice label="Syrup" value={value.syrup} choices={options.syrups} suffix="%" onChange={syrup => onChange({ ...value, syrup })} />
    {value.temperature === 'Iced' && <Choice label="Ice" value={value.ice} choices={options.iceLevels} onChange={ice => onChange({ ...value, ice })} />}
  </>;
}
