// Only photo fields used by profiles, cats and archived reports.
export function photoFields(data) {
  const fields = [];
  if (!data || typeof data !== 'object' || Array.isArray(data)) return fields;
  for (const key of ['avatar', 'photoURL']) fields.push({ target: data, key });
  for (const cats of [data.cats, data.report?.cats]) {
    if (Array.isArray(cats)) for (const cat of cats) {
      if (cat && typeof cat === 'object' && !Array.isArray(cat)) fields.push({ target: cat, key: 'avatar' });
    }
  }
  return fields;
}
