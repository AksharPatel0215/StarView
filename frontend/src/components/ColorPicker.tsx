import { PALETTE } from '../graphTheme';
export default function ColorPicker({ value, onChange, disabled = false, label = 'Color' }: { value: string | null; onChange: (value: string | null) => void; disabled?: boolean; label?: string }) {
  return <div className="color-picker" role="group" aria-label={label}>
    <button type="button" className="color-auto" aria-pressed={!value} disabled={disabled} onClick={() => onChange(null)} title="Use automatic theme color">Auto</button>
    {PALETTE.map(item => <button type="button" key={item.color} className="color-swatch" style={{ background: item.color }} aria-label={`${label}: ${item.name}`} title={item.name} aria-pressed={value === item.color} disabled={disabled} onClick={() => onChange(item.color)} />)}
  </div>;
}
