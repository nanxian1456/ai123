"use strict";
// Region names are stored as the user typed them; statistics, filters and search compare
// the canonical form from here, so "江苏省 / 江苏 / Jiangsu" and "南京市 / 南京" count as one place.
// Province and prefecture names follow the mainland administrative divisions; only mainland
// provinces and prefectures are used to fill in a missing country.
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeCountry = normalizeCountry;
exports.countryOption = countryOption;
exports.searchCountries = searchCountries;
exports.provinceNames = provinceNames;
exports.cityNames = cityNames;
exports.normalizeProvince = normalizeProvince;
exports.normalizeCity = normalizeCity;
exports.normalizePath = normalizePath;
exports.regionOf = regionOf;
const countries_1 = require("./countries");
const CHINA = "中国";
const COUNTRY_ALIASES = {
    中国: ["中华人民共和国", "中国大陆", "大陆", "china", "prc", "p.r.china", "p.r. china", "people's republic of china", "cn", "mainland china"],
    美国: ["美利坚合众国", "usa", "us", "u.s.", "u.s.a.", "united states", "united states of america", "america"],
    英国: ["大不列颠", "uk", "u.k.", "united kingdom", "great britain", "britain"],
    日本: ["japan"],
    韩国: ["南韩", "大韩民国", "south korea", "korea", "republic of korea"],
    德国: ["germany"],
    法国: ["france"],
    加拿大: ["canada"],
    澳大利亚: ["澳洲", "australia"],
    俄罗斯: ["俄国", "russia", "russian federation"],
    新加坡: ["singapore"],
    新西兰: ["new zealand"],
    意大利: ["italy"],
    西班牙: ["spain"],
    荷兰: ["netherlands", "holland"],
    瑞士: ["switzerland"],
    印度: ["india"],
    马来西亚: ["malaysia"],
    泰国: ["thailand"]
};
// short name | full name | pinyin | prefecture-level divisions (short names, a few kept in full to avoid clashes)
const PROVINCES = `北京|北京市|beijing|北京
天津|天津市|tianjin|天津
上海|上海市|shanghai|上海
重庆|重庆市|chongqing|重庆
河北|河北省|hebei|石家庄 唐山 秦皇岛 邯郸 邢台 保定 张家口 承德 沧州 廊坊 衡水
山西|山西省|shanxi|太原 大同 阳泉 长治 晋城 朔州 晋中 运城 忻州 临汾 吕梁
内蒙古|内蒙古自治区|inner mongolia|呼和浩特 包头 乌海 赤峰 通辽 鄂尔多斯 呼伦贝尔 巴彦淖尔 乌兰察布 兴安 锡林郭勒 阿拉善
辽宁|辽宁省|liaoning|沈阳 大连 鞍山 抚顺 本溪 丹东 锦州 营口 阜新 辽阳 盘锦 铁岭 朝阳 葫芦岛
吉林|吉林省|jilin|长春 吉林 四平 辽源 通化 白山 松原 白城 延边
黑龙江|黑龙江省|heilongjiang|哈尔滨 齐齐哈尔 鸡西 鹤岗 双鸭山 大庆 伊春 佳木斯 七台河 牡丹江 黑河 绥化 大兴安岭
江苏|江苏省|jiangsu|南京 无锡 徐州 常州 苏州 南通 连云港 淮安 盐城 扬州 镇江 泰州 宿迁
浙江|浙江省|zhejiang|杭州 宁波 温州 嘉兴 湖州 绍兴 金华 衢州 舟山 台州 丽水
安徽|安徽省|anhui|合肥 芜湖 蚌埠 淮南 马鞍山 淮北 铜陵 安庆 黄山 滁州 阜阳 宿州 六安 亳州 池州 宣城
福建|福建省|fujian|福州 厦门 莆田 三明 泉州 漳州 南平 龙岩 宁德
江西|江西省|jiangxi|南昌 景德镇 萍乡 九江 新余 鹰潭 赣州 吉安 宜春 抚州 上饶
山东|山东省|shandong|济南 青岛 淄博 枣庄 东营 烟台 潍坊 济宁 泰安 威海 日照 临沂 德州 聊城 滨州 菏泽
河南|河南省|henan|郑州 开封 洛阳 平顶山 安阳 鹤壁 新乡 焦作 濮阳 许昌 漯河 三门峡 南阳 商丘 信阳 周口 驻马店 济源
湖北|湖北省|hubei|武汉 黄石 十堰 宜昌 襄阳 鄂州 荆门 孝感 荆州 黄冈 咸宁 随州 恩施 仙桃 潜江 天门 神农架
湖南|湖南省|hunan|长沙 株洲 湘潭 衡阳 邵阳 岳阳 常德 张家界 益阳 郴州 永州 怀化 娄底 湘西
广东|广东省|guangdong|广州 韶关 深圳 珠海 汕头 佛山 江门 湛江 茂名 肇庆 惠州 梅州 汕尾 河源 阳江 清远 东莞 中山 潮州 揭阳 云浮
广西|广西壮族自治区|guangxi|南宁 柳州 桂林 梧州 北海 防城港 钦州 贵港 玉林 百色 贺州 河池 来宾 崇左
海南|海南省|hainan|海口 三亚 三沙 儋州
四川|四川省|sichuan|成都 自贡 攀枝花 泸州 德阳 绵阳 广元 遂宁 内江 乐山 南充 眉山 宜宾 广安 达州 雅安 巴中 资阳 阿坝 甘孜 凉山
贵州|贵州省|guizhou|贵阳 六盘水 遵义 安顺 毕节 铜仁 黔西南 黔东南 黔南
云南|云南省|yunnan|昆明 曲靖 玉溪 保山 昭通 丽江 普洱 临沧 楚雄 红河 文山 西双版纳 大理 德宏 怒江 迪庆
西藏|西藏自治区|tibet xizang|拉萨 日喀则 昌都 林芝 山南 那曲 阿里
陕西|陕西省|shaanxi|西安 铜川 宝鸡 咸阳 渭南 延安 汉中 榆林 安康 商洛
甘肃|甘肃省|gansu|兰州 嘉峪关 金昌 白银 天水 武威 张掖 平凉 酒泉 庆阳 定西 陇南 临夏 甘南
青海|青海省|qinghai|西宁 海东 海北 黄南 海南藏族自治州 果洛 玉树 海西
宁夏|宁夏回族自治区|ningxia|银川 石嘴山 吴忠 固原 中卫
新疆|新疆维吾尔自治区|xinjiang|乌鲁木齐 克拉玛依 吐鲁番 哈密 昌吉 博尔塔拉 巴音郭楞 阿克苏 克孜勒苏 喀什 和田 伊犁 塔城 阿勒泰 石河子`;
// Normalised for spelling only; they never fill in a missing country.
const OTHER_PROVINCES = `香港|香港特别行政区|hong kong
澳门|澳门特别行政区|macau macao
台湾|台湾省|taiwan`;
const MUNICIPALITIES = new Set(["北京", "天津", "上海", "重庆"]);
// Longest first, so "藏族自治州" is removed before "自治州".
const CITY_SUFFIXES = ["土家族苗族自治州", "布依族苗族自治州", "苗族侗族自治州", "哈尼族彝族自治州", "壮族苗族自治州", "傣族景颇族自治州",
    "蒙古族藏族自治州", "藏族羌族自治州", "朝鲜族自治州", "柯尔克孜自治州", "哈萨克自治州", "傈僳族自治州", "回族自治州", "藏族自治州",
    "彝族自治州", "白族自治州", "傣族自治州", "蒙古自治州", "自治州", "林区", "地区", "盟", "市"];
const countryIndex = new Map();
Object.entries(COUNTRY_ALIASES).forEach(([name, aliases]) => [name, ...aliases].forEach(alias => countryIndex.set(alias.toLowerCase(), name)));
const provinceIndex = new Map();
const mainland = new Set();
const cityProvince = new Map();
function indexProvinces(table, isMainland) {
    table.split("\n").forEach(line => {
        const [short, full, pinyin, cities] = line.split("|");
        [short, full, ...pinyin.split(" ")].forEach(alias => provinceIndex.set(alias.toLowerCase(), short));
        if (!isMainland)
            return;
        mainland.add(short);
        cities.split(" ").forEach(city => cityProvince.set(city, short));
    });
}
indexProvinces(PROVINCES, true);
indexProvinces(OTHER_PROVINCES, false);
const clean = (value) => (typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "");
function normalizeCountry(value) {
    const text = clean(value);
    return countryIndex.get(text.toLowerCase()) || (0, countries_1.countryFor)(text)?.name || text;
}
function countryOption(value) {
    return (0, countries_1.countryFor)(normalizeCountry(value));
}
function searchCountries(keyword = "") {
    const query = clean(keyword).toLowerCase();
    const exact = countryOption(query);
    return countries_1.COUNTRIES.filter(country => !query || country.code === exact?.code ||
        [country.name, country.english, country.code].some(value => value.toLowerCase().includes(query)))
        .sort((a, b) => Number(b.code === exact?.code) - Number(a.code === exact?.code));
}
function provinceNames() {
    return (PROVINCES + "\n" + OTHER_PROVINCES).split("\n").map(line => line.split("|")[0]);
}
function cityNames(province) {
    const name = normalizeProvince(province);
    const row = PROVINCES.split("\n").find(line => line.split("|")[0] === name);
    return row ? row.split("|")[3].split(" ") : [];
}
function normalizeProvince(value) {
    const text = clean(value);
    if (!text)
        return "";
    const known = provinceIndex.get(text.toLowerCase());
    if (known)
        return known;
    const stripped = text.replace(/(省|市|自治区|特别行政区)$/, "");
    return provinceIndex.get(stripped) || text;
}
function normalizeCity(value) {
    const text = clean(value);
    if (!text || cityProvince.has(text))
        return text;
    for (const suffix of CITY_SUFFIXES) {
        if (text.length > suffix.length + 1 && text.endsWith(suffix)) {
            const short = text.slice(0, -suffix.length);
            // Keep the full name where the short form would read as a province.
            return provinceIndex.has(short) && !MUNICIPALITIES.has(short) && !cityProvince.has(short) ? text : short;
        }
    }
    return text;
}
// Canonical spelling only; Chinese suffix rules are not applied to foreign place names.
function normalizePath(path) {
    const country = normalizeCountry(path.country);
    const foreign = !!country && country !== CHINA;
    return {
        country,
        province: foreign ? clean(path.province) : normalizeProvince(path.province),
        city: foreign ? clean(path.city) : normalizeCity(path.city)
    };
}
// The canonical place of a contact, with a missing country (and province) filled in from mainland names.
function regionOf(contact) {
    let { country, province, city } = normalizePath(contact);
    if (!country || country === CHINA) {
        const cityHome = cityProvince.get(city) || "";
        const consistent = !province || province === cityHome;
        if (!province && cityHome)
            province = cityHome;
        if (!country && (mainland.has(province) || (cityHome && consistent)))
            country = CHINA;
        if (country === CHINA && !city && MUNICIPALITIES.has(province))
            city = province;
    }
    return { country, province, city };
}
