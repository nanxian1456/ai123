function normalize(value) { return String(value || "").trim().toLowerCase(); }
function phone(value) { return String(value || "").replace(/[^0-9+]/g, ""); }
function findPotentialDuplicates(contacts, draft, excludedId) {
  const name = normalize(draft.name);
  const organization = normalize(draft.organization);
  const draftPhone = phone(draft.phone);
  const email = normalize(draft.email);
  return contacts.filter(item => {
    if (item.id === Number(excludedId)) return false;
    if (draftPhone && draftPhone.length >= 6 && phone(item.phone) === draftPhone) return true;
    if (email && normalize(item.email) === email) return true;
    return name && normalize(item.name) === name && (!organization || normalize(item.organization) === organization);
  }).slice(0, 5);
}
module.exports = { findPotentialDuplicates };
