const { findPotentialDuplicates } = require("./duplicates");

function parse(text, existing) {
  const lines = String(text || "").split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (!lines.length) throw new Error("请先输入联系人");
  if (lines.length > 100) throw new Error("每次最多整理100位联系人");
  const entries = [];
  for (const [index, line] of lines.entries()) {
    const parts = line.split("|").map(value => value.trim());
    if (parts.length !== 5 || !parts[0]) throw new Error(`第${index + 1}行格式有误，请按姓名|单位|职务|城市|电话填写`);
    const contact = { name: parts[0], organization: parts[1], position: parts[2], city: parts[3], phone: parts[4], province: "", email: "", note: "", tags: [] };
    const duplicate = findPotentialDuplicates([...existing, ...entries], contact).length > 0;
    entries.push({ ...contact, duplicate, selected: !duplicate, row: index + 1 });
  }
  return entries;
}
module.exports = { parse };
