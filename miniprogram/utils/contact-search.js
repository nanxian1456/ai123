"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.contactMatchesKeyword = contactMatchesKeyword;
// Shared by the contacts page (through local-data) and the map page so both search the same fields.
const TEXT_FIELDS = ["name", "organization", "position", "city", "province", "country", "address", "phone", "email", "note"];
function contactMatchesKeyword(contact, keyword) {
    const kw = (keyword || "").toLowerCase().trim();
    if (!kw)
        return true;
    const values = [...TEXT_FIELDS.map(field => contact[field]), ...(Array.isArray(contact.tags) ? contact.tags : [])];
    return values.some(value => typeof value === "string" && value.toLowerCase().includes(kw));
}
