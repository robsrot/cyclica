import { useState } from 'react';
import { MEAL_TYPE_LABEL, PORTION_LABEL } from '../../../domain/model/labels';
import type { FoodItemRec, MealRec } from '../../../domain/model/records';
import { wallDate, type LocalDateTime } from '../../../domain/time';
import { ChoiceChips, DateTimeField, More, MultiChips, Section, TextArea, opts } from '../../../ui/controls';
import { FormShell, compact, defaultTimeFor, existing, newBase, type FormProps } from '../editor';

interface Picked {
  id: string;
  name: string;
  isNew: boolean;
  categories?: string[];
}

/**
 * Meals are recorded as food items (reusable), a free description, and the user's own category tags.
 * No nutritional values are calculated or shown: nothing here comes from a nutrition database.
 */
export function MealForm({ session, id, date, onDone }: FormProps) {
  const orig = existing(session, id, 'meal');
  const library = session.byKind('foodItem');
  const byId = new Map(library.map((f) => [f.id, f]));
  const [at, setAt] = useState<LocalDateTime | undefined>(orig?.occurredAt ?? defaultTimeFor(date));
  const [mealType, setMealType] = useState(orig?.mealType);
  const [items, setItems] = useState<Picked[]>(
    () =>
      orig?.foodItemIds?.map((fid) => ({ id: fid, name: byId.get(fid)?.name ?? '(deleted item)', isNew: false, categories: byId.get(fid)?.categories })) ?? [],
  );
  const [query, setQuery] = useState('');
  const [description, setDescription] = useState(orig?.description);
  const [portion, setPortion] = useState(orig?.portion);
  const [categories, setCategories] = useState<string[] | undefined>(orig?.categories);
  const [notes, setNotes] = useState(orig?.notes);

  const q = query.trim().toLowerCase();
  const usage = new Map<string, number>();
  for (const m of session.byKind('meal')) for (const fid of m.foodItemIds ?? []) usage.set(fid, (usage.get(fid) ?? 0) + 1);
  const suggestions = library
    .filter((f) => !f.archived && !items.some((i) => i.id === f.id))
    .filter((f) => !q || f.name.toLowerCase().includes(q) || f.ingredients?.some((g) => g.toLowerCase().includes(q)))
    .sort((a, b) => (usage.get(b.id) ?? 0) - (usage.get(a.id) ?? 0) || a.name.localeCompare(b.name))
    .slice(0, 8);
  const exact = library.some((f) => f.name.toLowerCase() === q) || items.some((i) => i.name.toLowerCase() === q);

  const categoryOptions = [...new Set([...session.settings.foodCategories, ...(categories ?? [])])].map((c) => ({ value: c, label: c }));

  const pick = (p: Picked) => {
    setItems([...items, p]);
    setQuery('');
    // Categories the user gave this food item are suggested for the meal (removable).
    if (p.categories?.length) setCategories([...new Set([...(categories ?? []), ...p.categories])]);
  };

  const anything = !!(mealType || items.length || description);

  const save = async () => {
    if (!at) throw new Error('A time is needed.');
    const ids: string[] = [];
    for (const i of items) {
      if (i.isNew) {
        const f = await session.save<'foodItem'>({ ...newBase('foodItem'), kind: 'foodItem', name: i.name } as FoodItemRec);
        ids.push(f.id);
      } else ids.push(i.id);
    }
    await session.save<'meal'>(
      compact({
        ...(orig ?? newBase('meal')),
        kind: 'meal',
        occurredAt: at,
        date: wallDate(at),
        mealType,
        foodItemIds: ids,
        description,
        portion,
        categories,
        notes,
      }) as MealRec,
    );
    onDone();
  };

  return (
    <FormShell
      title={orig ? 'Edit meal' : 'Meal or drink'}
      onCancel={onDone}
      onSave={save}
      canSave={!!at && anything}
      saveHint="Choose a type, add a food item or write a short description."
      onDelete={orig ? async () => (await session.remove(orig.id), onDone()) : undefined}
    >
      <DateTimeField label="Time" value={at} onChange={setAt} />
      <Section title="Type">
        <ChoiceChips options={opts(MEAL_TYPE_LABEL)} value={mealType} onChange={setMealType} />
      </Section>

      <Section title="What you had" hint="Pick from your food list or add new items. They're saved for next time.">
        {items.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {items.map((i) => (
              <li key={i.id}>
                <button
                  type="button"
                  onClick={() => setItems(items.filter((x) => x.id !== i.id))}
                  className="min-h-11 rounded-full border border-sage-deep bg-sage-deep px-4 py-2 text-white"
                  aria-label={`Remove ${i.name}`}
                >
                  {i.name} <span aria-hidden>×</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <input
          aria-label="Search or add a food item"
          className="min-h-12 w-full rounded-xl border border-line bg-white px-4 py-3"
          placeholder="Search or add, e.g. oat porridge"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && q && !exact) {
              e.preventDefault();
              pick({ id: crypto.randomUUID(), name: query.trim(), isNew: true });
            }
          }}
        />
        <div className="flex flex-wrap gap-2">
          {suggestions.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => pick({ id: f.id, name: f.name, isNew: false, categories: f.categories })}
              className="min-h-11 rounded-full border border-line bg-white px-4 py-2 active:bg-cream"
            >
              + {f.name}
            </button>
          ))}
          {q && !exact && (
            <button
              type="button"
              onClick={() => pick({ id: crypto.randomUUID(), name: query.trim(), isNew: true })}
              className="min-h-11 rounded-full border border-dashed border-sage-deep px-4 py-2 text-sage-deep"
            >
              Add "{query.trim()}" as new item
            </button>
          )}
        </div>
      </Section>

      <TextArea label="Description (optional)" value={description} onChange={setDescription} placeholder="e.g. ate out, big portion of pasta" rows={2} />

      <Section title="Categories you monitor" hint="Your own tags. Edit the list in Settings → Tracking options.">
        <MultiChips options={categoryOptions} value={categories} onChange={setCategories} />
      </Section>

      <More label="Portion & notes" defaultOpen={!!(portion || notes)}>
        <Section title="Portion size (your estimate)">
          <ChoiceChips options={opts(PORTION_LABEL)} value={portion} onChange={setPortion} />
        </Section>
        <TextArea label="Notes" value={notes} onChange={setNotes} />
      </More>
      <p className="text-sm text-ink-soft">Cyclica doesn't estimate calories or nutrients.</p>
    </FormShell>
  );
}
