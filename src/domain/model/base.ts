import { z } from 'zod';

/** ISO-8601 instant in UTC, e.g. 2026-11-08T14:30:00.000Z */
export const IsoInstant = z.iso.datetime();

/**
 * Fields every stored record has. Kind-specific schemas (milestone M3) extend this.
 * Only user-entered information is stored; calculated and estimated values are derived at read time.
 */
export const BaseRecord = z.looseObject({
  id: z.uuid(),
  kind: z.string().min(1),
  schemaVersion: z.number().int().positive(),
  createdAt: IsoInstant,
  updatedAt: IsoInstant,
  notes: z.string().optional(),
  links: z.array(z.uuid()).optional(),
});

export type BaseRecord = z.infer<typeof BaseRecord>;

export function newId(): string {
  return globalThis.crypto.randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}
