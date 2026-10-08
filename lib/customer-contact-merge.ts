type RecordLike = Record<string, unknown>;
const records = (value: unknown) => Array.isArray(value) ? value.filter(item => item && typeof item === 'object' && !Array.isArray(item)) as RecordLike[] : [];
const strings = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).map(item => item.trim()) : [];
const key = (value: unknown) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** Enrich a matched customer without erasing existing contact information. */
export function customerContactPatch(existing: RecordLike, incoming: RecordLike) {
  const patch: RecordLike = {};
  for (const field of ['emails', 'phones'] as const) {
    const before = strings(existing[field]);
    const additions = strings(incoming[field]).filter(item => !before.some(saved => key(saved) === key(item)));
    if (additions.length) patch[field] = [...before, ...additions];
  }
  const before = records(existing.addresses);
  const addresses = before.map(address => ({ ...address }));
  for (const incomingAddress of records(incoming.addresses)) {
    if (!incomingAddress.line1 && !incomingAddress.city) continue;
    const matching = addresses.find(address => (key(address.line1) === key(incomingAddress.line1)
      || !address.line1 && (address.postal_code && key(address.postal_code) === key(incomingAddress.postal_code) || address.city && key(address.city) === key(incomingAddress.city)))
      && (!address.postal_code || !incomingAddress.postal_code || key(address.postal_code) === key(incomingAddress.postal_code)));
    if (matching) {
      for (const [field, value] of Object.entries(incomingAddress)) if (!matching[field] && value) matching[field] = value;
    } else addresses.push({ ...incomingAddress });
  }
  if (JSON.stringify(before) !== JSON.stringify(addresses)) patch.addresses = addresses;
  if (!existing.civility && incoming.civility) patch.civility = incoming.civility;
  if (!existing.notes && incoming.notes) patch.notes = incoming.notes;
  return patch;
}
