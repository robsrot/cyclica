import { useState } from 'react';
import type { Session } from '../../data/session';
import { Button, Card } from '../../ui/components';
import { todayLocal } from '../../domain/time';
import { useOpenEditor } from '../track/editor';

function EditableList({
  title,
  hint,
  items,
  onChange,
  placeholder,
}: {
  title: string;
  hint: string;
  items: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
}) {
  const [value, setValue] = useState('');
  const add = () => {
    const v = value.trim();
    if (v && !items.some((i) => i.toLowerCase() === v.toLowerCase())) onChange([...items, v]);
    setValue('');
  };
  return (
    <div className="flex flex-col gap-2">
      <h3 className="font-semibold">{title}</h3>
      <p className="-mt-1 text-sm text-ink-soft">{hint}</p>
      <ul className="flex flex-wrap gap-2">
        {items.map((i) => (
          <li key={i}>
            <button
              type="button"
              aria-label={`Remove ${i}`}
              onClick={() => onChange(items.filter((x) => x !== i))}
              className="min-h-10 rounded-full border border-line bg-white px-3"
            >
              {i} <span aria-hidden>×</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <input
          aria-label={`Add to ${title}`}
          className="min-h-11 flex-1 rounded-xl border border-line bg-white px-3"
          placeholder={placeholder}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())}
        />
        <Button variant="secondary" className="min-h-11 px-4 py-2" onClick={add} disabled={!value.trim()}>
          Add
        </Button>
      </div>
    </div>
  );
}

export function TrackingOptionsCard({ session }: { session: Session }) {
  const open = useOpenEditor();
  const [showFood, setShowFood] = useState(false);
  const food = session.byKind('foodItem').sort((a, b) => a.name.localeCompare(b.name));
  return (
    <Card>
      <h2 className="mb-3 text-lg font-semibold">Tracking options</h2>
      <div className="flex flex-col gap-6">
        <EditableList
          title="Food categories"
          hint="Tags you can add to meals, e.g. to watch dairy or gluten. Removing one keeps it on meals already recorded."
          items={session.settings.foodCategories}
          onChange={(v) => void session.updateSettings({ foodCategories: v })}
          placeholder="e.g. Spicy food"
        />
        <EditableList
          title="Your own cycle symptoms"
          hint="Shown next to the built-in symptoms in the Period entry."
          items={session.settings.customCycleSymptoms}
          onChange={(v) => void session.updateSettings({ customCycleSymptoms: v })}
          placeholder="e.g. Back pain"
        />
        <div className="flex flex-col gap-2">
          <h3 className="font-semibold">Food list</h3>
          <p className="-mt-1 text-sm text-ink-soft">{food.length} reusable food item{food.length === 1 ? '' : 's'}. Add ingredients or categories to an item here.</p>
          {showFood ? (
            <ul className="flex flex-col">
              {food.map((f) => (
                <li key={f.id}>
                  <button
                    type="button"
                    className="flex w-full justify-between border-b border-line py-3 text-left active:bg-cream"
                    onClick={() => open({ form: 'foodItem', id: f.id, date: todayLocal() })}
                  >
                    <span>
                      {f.name}
                      {f.archived && <span className="text-sm text-ink-soft"> (hidden)</span>}
                    </span>
                    <span className="text-sm text-ink-soft">{f.categories?.join(', ')}</span>
                  </button>
                </li>
              ))}
              <li className="pt-3">
                <Button variant="secondary" onClick={() => open({ form: 'foodItem', date: todayLocal() })}>
                  + New food item
                </Button>
              </li>
            </ul>
          ) : (
            <Button variant="secondary" className="self-start" onClick={() => setShowFood(true)}>
              Show food list
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
