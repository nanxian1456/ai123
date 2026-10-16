export const SUGGESTED_TAGS = ["院长", "青年人才", "企业联系人", "人工智能", "产学合作"];

export function splitTags(value: string): string[] {
  return String(value || "").split(/[，,]/).map(tag => tag.trim()).filter(Boolean);
}

export function filterTags(tags: Array<{ name: string; count: number }>): Array<{ name: string; count: number }> {
  const counts = new Map((tags || []).map(({ name, count }) => [name, count]));
  return [
    ...SUGGESTED_TAGS.map(name => ({ name, count: counts.get(name) || 0 })),
    ...(tags || []).filter(({ name }) => !SUGGESTED_TAGS.includes(name))
  ];
}

export function suggestedTagOptions(value: string, tags: Array<{ name: string }> = []): Array<{ name: string; selected: boolean }> {
  const selected = new Set(splitTags(value));
  const names = [...SUGGESTED_TAGS, ...tags.map(({ name }) => name).filter(name => !SUGGESTED_TAGS.includes(name))];
  return names.map(name => ({ name, selected: selected.has(name) }));
}
