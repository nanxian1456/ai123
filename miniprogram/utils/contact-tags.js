"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SUGGESTED_TAGS = void 0;
exports.splitTags = splitTags;
exports.filterTags = filterTags;
exports.suggestedTagOptions = suggestedTagOptions;
exports.SUGGESTED_TAGS = ["院长", "青年人才", "企业联系人", "人工智能", "产学合作"];
function splitTags(value) {
    return String(value || "").split(/[，,]/).map(tag => tag.trim()).filter(Boolean);
}
function filterTags(tags) {
    const counts = new Map((tags || []).map(({ name, count }) => [name, count]));
    return [
        ...exports.SUGGESTED_TAGS.map(name => ({ name, count: counts.get(name) || 0 })),
        ...(tags || []).filter(({ name }) => !exports.SUGGESTED_TAGS.includes(name))
    ];
}
function suggestedTagOptions(value, tags = []) {
    const selected = new Set(splitTags(value));
    const names = [...exports.SUGGESTED_TAGS, ...tags.map(({ name }) => name).filter(name => !exports.SUGGESTED_TAGS.includes(name))];
    return names.map(name => ({ name, selected: selected.has(name) }));
}
