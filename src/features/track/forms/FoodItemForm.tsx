import { useState } from 'react';
import type { FoodItemRec } from '../../../domain/model/records';
import { Notice } from '../../../ui/components';
import { MultiChips, Section, TextInput, YesNo } from '../../../ui/controls';
import { FormShell, compact, existing, newBase, type FormProps } from '../editor';

/** A reusable food item in the food list. Items used by meals can be hidden (archived) but not deleted. */
export function FoodItemForm({ session, id, onDone }: FormProps) {
  const orig = existing(session, id, 'foodItem');
  const [name, setName] = useState(orig?.name);
  const [ingredients, setIngredients] = useState(orig?.ingredients?.join(', '));
  const [categories, setCategories] = useState(orig?.categories);
  const [archived, setArchived] = useState(orig?.archived);
  const usedBy = orig ? session.byKind('meal').filter((m) => m.foodItemIds?.includes(orig.id)).length : 0;
  const duplicate = !!name && session.byKind('foodItem').some((f) => f.id !== orig?.id && f.name.toLowerCase() === name.trim().toLowerCase());
  const categoryOptions = [...new Set([...session.settings.foodCategories, ...(categories ?? [])])].map((c) => ({ value: c, label: c }));

  const save = async () => {
    if (!name) throw new Error('A name is needed.');
    const list = ingredients?.split(',').map((s) => s.trim()).filter(Boolean);
    await session.save<'foodItem'>(
      compact({ ...(orig ?? newBase('foodItem')), kind: 'foodItem', name: name.trim(), ingredients: list, categories, archived: archived || undefined }) as FoodItemRec,
    );
    onDone();
  };

  return (
    <FormShell
      title={orig ? 'Edit food item' : 'New food item'}
      onCancel={onDone}
      onSave={save}
      canSave={!!name && !duplicate}
      saveHint={duplicate ? 'A food item with this name already exists.' : 'Enter a name.'}
      onDelete={orig && usedBy === 0 ? async () => (await session.remove(orig.id), onDone()) : undefined}
    >
      <TextInput label="Name" value={name} onChange={setName} />
      <TextInput label="Ingredients (comma-separated, optional)" value={ingredients} onChange={setIngredients} placeholder="oats, milk, honey" />
      <Section title="Categories" hint="Added to meals with this item as a suggestion you can remove.">
        <MultiChips options={categoryOptions} value={categories} onChange={setCategories} />
      </Section>
      {orig && (
        <Section title="Hide from suggestions">
          <YesNo value={archived ?? false} onChange={(v) => setArchived(v)} />
        </Section>
      )}
      {usedBy > 0 && <Notice>Used in {usedBy} meal{usedBy === 1 ? '' : 's'}, so it can be hidden but not deleted.</Notice>}
    </FormShell>
  );
}
