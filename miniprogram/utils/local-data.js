const PREFIX = "ai-network-local-v1:";
const PRIVATE = { avatar: false, nickname: false, organization: false, position: false, city: false, bio: false };
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const SURNAMES = "赵Z钱Q孙S李L周Z吴W郑Z王W冯F陈C褚C卫W蒋J沈S韩H杨Y朱Z秦Q尤Y许X何H吕L施S张Z孔K曹C严Y华H金J魏W陶T姜J戚Q谢X邹Z喻Y柏B水S窦D章Z云Y苏S潘P葛G奚X范F彭P郎L鲁L韦W昌C马M苗M凤F花H方F俞Y任R袁Y柳L鲍B史S唐T费F廉L岑C薛X雷L贺H倪N汤T滕T殷Y罗L毕B郝H邬W安A常C乐Y于Y时S傅F皮P卞B齐Q康K伍W余Y元Y卜B顾G孟M平P黄H和H穆M萧X尹Y姚Y邵S湛Z汪W祁Q毛M禹Y狄D米M贝B明M臧Z计J伏F成C戴D宋S茅M庞P熊X纪J舒S屈Q项X祝Z董D梁L杜D阮R蓝L闵M席X季J麻M强Q贾J路L娄L危W江J童T颜Y郭G梅M盛S林L刁D钟Z徐X邱Q骆L高G夏X蔡C田T樊F胡H凌L霍H虞Y万W支Z柯K昝Z管G卢L莫M经J房F裘Q缪M干G解X应Y宗Z丁D宣X贲B邓D郁Y单S杭H洪H包B诸Z左Z石S崔C吉J龚G程C嵇J邢X滑H裴P陆L荣R翁W荀X羊Y惠H甄Z曲Q家J封F芮R羿Y储C靳J汲J邴B糜M松S井J段D富F巫W乌W焦J巴B弓G牧M隗W山S谷G车C侯H宓M蓬P全Q郗X班B仰Y秋Q仲Z伊Y宫G宁N仇Q栾L暴B甘G钭T厉L戎R祖Z武W符F刘L景J詹Z束S龙L叶Y幸X司S韶S黎L蓟J薄B印Y宿S白B怀H蒲P台T从C鄂E索S赖L卓Z蔺L屠T蒙M池C乔Q阴Y胥X能N苍C双S闻W莘S党D翟Z谭T贡G劳L逄P姬J申S扶F堵D冉R宰Z郦L雍Y却Q璩Q桑S桂G濮P牛N寿S通T边B扈H燕Y冀J郏J浦P尚S农N温W别B庄Z晏Y柴C瞿Q阎Y充C慕M连L茹R习X宦H艾A鱼Y容R向X古G易Y慎S戈G廖L庾Y终Z暨J居J衡H步B都D耿G满M弘H匡K国G文W寇K广G禄L阙Q东D欧O殳S沃W利L蔚W越Y夔K隆L师S巩G厍S聂N晁C勾G敖A融R冷L訾Z辛X阚K那N简J饶R空K曾Z毋W沙S乜N养Y鞠J须X丰F巢C关G蒯K相X查Z后H荆J红H游Y竺Z权Q逯L盖G益Y桓H公G";
const surnameInitial = {};
for (let index = 0; index < SURNAMES.length; index += 2) surnameInitial[SURNAMES[index]] = SURNAMES[index + 1];

function emptyProfile(ownerId) {
  return { ownerId, nickname: "", organization: "", position: "", city: "", bio: "", avatarType: "male-1", avatarUrl: "", visibility: { ...PRIVATE }, profileCompleted: false, contactCode: "" };
}
function key(ownerId) { return PREFIX + ownerId; }
function read(ownerId) {
  const stored = wx.getStorageSync(key(ownerId));
  return stored && stored.version === 1 ? stored : null;
}
function write(ownerId, value) {
  wx.setStorageSync(key(ownerId), value);
  return value;
}
function text(value, label, limit, required = false) {
  const result = String(value == null ? "" : value).trim();
  if (required && !result) throw new Error(`${label}不能为空`);
  if (result.length > limit) throw new Error(`${label}不能超过${limit}字`);
  return result;
}
function contactInput(payload) {
  if (!payload || typeof payload !== "object") throw new Error("联系人资料无效");
  const result = {};
  for (const [field, label, limit] of [["name", "姓名", 50], ["organization", "单位", 100], ["position", "职务", 50], ["city", "城市", 50], ["province", "省份", 50], ["phone", "电话", 30], ["email", "邮箱", 100], ["note", "备注", 500]]) {
    result[field] = text(payload[field], label, limit, field === "name");
  }
  if (result.phone && !/^[0-9+()\- ]{6,30}$/.test(result.phone)) throw new Error("手机号格式无效");
  if (result.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email)) throw new Error("邮箱格式无效");
  if (payload.tags != null && !Array.isArray(payload.tags)) throw new Error("标签格式无效");
  result.tags = (payload.tags || []).map(item => text(item, "标签", 20, true));
  if (result.tags.length > 10) throw new Error("标签最多10个");
  result.tags = Array.from(new Set(result.tags));
  return result;
}
function migrate(ownerId, exportData) {
  if (read(ownerId)) return read(ownerId);
  if (!exportData || exportData.ownerId !== ownerId || !Array.isArray(exportData.contacts) || !Array.isArray(exportData.relationships)) throw new Error("旧数据格式不正确，尚未写入手机");
  const contacts = Array.isArray(exportData.contacts) ? exportData.contacts : [];
  const relationships = Array.isArray(exportData.relationships) ? exportData.relationships : [];
  const profile = exportData.profile ? { ...emptyProfile(ownerId), ...exportData.profile, visibility: { ...PRIVATE, ...(exportData.profile.visibility || {}) } } : emptyProfile(ownerId);
  const maxContactId = contacts.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0);
  const maxRelationshipId = relationships.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0);
  return write(ownerId, { version: 1, profile, contacts, relationships, nextContactId: maxContactId + 1, nextRelationshipId: maxRelationshipId + 1 });
}
function requireData(ownerId) {
  const data = read(ownerId);
  if (!data) throw new Error("本机数据尚未初始化，请先登录并导入旧数据");
  return data;
}
function initial(name) {
  const first = (name || "").trim()[0] || "";
  const letter = first.toUpperCase();
  return LETTERS.includes(letter) && letter.length === 1 ? letter : surnameInitial[first] || "#";
}
function count(values) {
  const counts = new Map();
  values.filter(Boolean).forEach(value => counts.set(value, (counts.get(value) || 0) + 1));
  return Array.from(counts, ([name, amount]) => ({ name, count: amount })).sort((a, b) => a.name.localeCompare(b.name, "zh"));
}
function matchContact(contact, query) {
  const keyword = (query.get("keyword") || "").toLowerCase().trim();
  return (!keyword || [contact.name, contact.organization, contact.position].some(value => (value || "").toLowerCase().includes(keyword)))
    && (!query.get("city") || contact.city === query.get("city"))
    && (!query.get("tag") || (contact.tags || []).includes(query.get("tag")));
}
function findContact(data, id) {
  const contact = data.contacts.find(item => item.id === Number(id));
  if (!contact) throw new Error("联系人不存在");
  return contact;
}
function relationshipView(data, contactId, item) {
  const outgoing = item.sourceId === contactId;
  const other = findContact(data, outgoing ? item.targetId : item.sourceId);
  const reverse = { "指导": "导师", "导师": "指导", "学生": "指导" };
  const label = outgoing ? item.type : reverse[item.type] || item.type;
  const summary = [other.organization, item.note].filter(Boolean).join(" · ");
  return { id: item.id, type: item.type, label, summary, other: { id: other.id, name: other.name, organization: other.organization } };
}
function graph(data, id) {
  const center = findContact(data, id);
  const edges = data.relationships.filter(item => item.sourceId === center.id || item.targetId === center.id);
  const ids = Array.from(new Set([center.id, ...edges.flatMap(item => [item.sourceId, item.targetId])]));
  return { nodes: ids.map(contactId => { const item = findContact(data, contactId); return { id: item.id, name: item.name, organization: item.organization, isCenter: item.id === center.id }; }), edges };
}
function handle(ownerId, path, method = "GET", payload) {
  const data = requireData(ownerId);
  const [route, search = ""] = path.split("?");
  const params = {};
  search.split("&").filter(Boolean).forEach(part => { const [name, value = ""] = part.split("="); params[decodeURIComponent(name)] = decodeURIComponent(value.replace(/\+/g, " ")); });
  const query = { get: name => params[name] || "" };
  if (route === "/me") {
    if (method === "GET") return data.profile;
    if (method === "PATCH") {
      const nickname = text(payload && payload.nickname, "昵称", 30, true);
      const avatarType = payload.avatarType || data.profile.avatarType;
      if (!["male-1", "male-2", "female-1", "female-2"].includes(avatarType)) throw new Error("头像类型无效");
      data.profile = { ...data.profile, nickname, organization: text(payload.organization, "单位", 60), position: text(payload.position, "职务", 40), city: text(payload.city, "城市", 30), bio: text(payload.bio, "简介", 200), avatarType, profileCompleted: true };
      write(ownerId, data);
      return data.profile;
    }
  }
  if (route === "/me/visibility" && method === "PATCH") {
    if (!payload || Object.keys(PRIVATE).some(field => typeof payload[field] !== "boolean")) throw new Error("公开设置无效");
    data.profile.visibility = Object.fromEntries(Object.keys(PRIVATE).map(field => [field, payload[field]]));
    write(ownerId, data);
    return data.profile;
  }
  if (route === "/contacts" && method === "GET") return data.contacts.filter(item => matchContact(item, query));
  if (route === "/contacts" && method === "POST") {
    const fields = contactInput(payload);
    const contact = { ...fields, id: data.nextContactId++, ownerId };
    data.contacts.push(contact);
    write(ownerId, data);
    return contact;
  }
  if (route === "/contacts/batch" && method === "POST") {
    if (!Array.isArray(payload) || !payload.length || payload.length > 100) throw new Error("批量联系人数量无效");
    const fields = payload.map(contactInput);
    const added = fields.map((item, index) => ({ ...item, id: data.nextContactId + index, ownerId }));
    data.contacts.push(...added);
    data.nextContactId += added.length;
    write(ownerId, data);
    return added;
  }
  if (route === "/contacts/directory" && method === "GET") {
    return data.contacts.filter(item => matchContact(item, query)).map(item => ({ ...item, initial: initial(item.name) }))
      .sort((a, b) => a.initial.localeCompare(b.initial) || a.name.localeCompare(b.name, "zh"));
  }
  if (route === "/contacts/page" && method === "GET") {
    const items = data.contacts.filter(item => matchContact(item, query));
    const page = Math.max(0, Number(query.get("page")) || 0);
    const size = Math.max(1, Math.min(100, Number(query.get("size")) || 20));
    return { items: items.slice(page * size, (page + 1) * size), page, size, totalElements: items.length, totalPages: Math.ceil(items.length / size) };
  }
  const relationshipRoute = route.match(/^\/contacts\/(\d+)\/relationships$/);
  if (relationshipRoute && method === "GET") {
    const contact = findContact(data, relationshipRoute[1]);
    return data.relationships.filter(item => item.sourceId === contact.id || item.targetId === contact.id).map(item => relationshipView(data, contact.id, item));
  }
  const contactRoute = route.match(/^\/contacts\/(\d+)$/);
  if (contactRoute) {
    const contact = findContact(data, contactRoute[1]);
    if (method === "GET") return contact;
    if (method === "PATCH") {
      Object.assign(contact, contactInput(payload));
      write(ownerId, data);
      return contact;
    }
    if (method === "DELETE") {
      data.contacts = data.contacts.filter(item => item.id !== contact.id);
      data.relationships = data.relationships.filter(item => item.sourceId !== contact.id && item.targetId !== contact.id);
      write(ownerId, data);
      return null;
    }
  }
  if (route === "/relationships" && method === "POST") {
    const source = findContact(data, payload.sourceId);
    const target = findContact(data, payload.targetId);
    if (source.id === target.id) throw new Error("关系对象无效");
    const relationship = { id: data.nextRelationshipId++, ownerId, sourceId: source.id, targetId: target.id, type: text(payload.type, "关系类型", 30, true), note: text(payload.note, "关系备注", 200) };
    data.relationships.push(relationship);
    write(ownerId, data);
    return relationship;
  }
  const deleteRelationship = route.match(/^\/relationships\/(\d+)$/);
  if (deleteRelationship && method === "DELETE") {
    const length = data.relationships.length;
    data.relationships = data.relationships.filter(item => item.id !== Number(deleteRelationship[1]));
    if (data.relationships.length === length) throw new Error("关系不存在");
    write(ownerId, data);
    return null;
  }
  const graphRoute = route.match(/^\/graphs\/contacts\/(\d+)$/);
  if (graphRoute && method === "GET") return graph(data, graphRoute[1]);
  if (route === "/dashboard" && method === "GET") return {
    contactCount: data.contacts.length,
    organizationCount: new Set(data.contacts.map(item => item.organization).filter(Boolean)).size,
    cityCount: new Set(data.contacts.map(item => item.city).filter(Boolean)).size,
    recentContacts: data.contacts.slice().sort((a, b) => b.id - a.id).slice(0, 3)
  };
  if (route === "/maps/cities" && method === "GET") return count(data.contacts.map(item => item.city));
  if (route === "/tags" && method === "GET") return count(data.contacts.flatMap(item => item.tags || []));
  if (route === "/organizations" && method === "GET") return count(data.contacts.map(item => item.organization));
  throw new Error("本地接口暂不支持此操作");
}

module.exports = { read, migrate, handle, write, key, initial };
