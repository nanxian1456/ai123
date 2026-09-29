const SUGGESTED_TAGS = ["院长", "青年人才", "企业联系人", "人工智能", "产学合作"];

function splitTags(value) {
  return String(value || "").split(/[，,]/).map((tag) => tag.trim()).filter(Boolean);
}

function filterTags(tags) {
  const counts = new Map((tags || []).map(({ name, count }) => [name, count]));
  return [
    ...SUGGESTED_TAGS.map((name) => ({ name, count: counts.get(name) || 0 })),
    ...(tags || []).filter(({ name }) => !SUGGESTED_TAGS.includes(name))
  ];
}

function suggestedTagOptions(value, tags = []) {
  const selected = new Set(splitTags(value));
  const names = [...SUGGESTED_TAGS, ...tags.map(({ name }) => name).filter((name) => !SUGGESTED_TAGS.includes(name))];
  return names.map((name) => ({ name, selected: selected.has(name) }));
}

module.exports = { SUGGESTED_TAGS, splitTags, filterTags, suggestedTagOptions };
