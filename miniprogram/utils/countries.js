"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.COUNTRIES = void 0;
exports.countryFor = countryFor;
exports.COUNTRIES = [
    {
        "code": "CN",
        "name": "中国",
        "english": "China"
    },
    {
        "code": "US",
        "name": "美国",
        "english": "United States"
    },
    {
        "code": "GB",
        "name": "英国",
        "english": "United Kingdom"
    },
    {
        "code": "JP",
        "name": "日本",
        "english": "Japan"
    },
    {
        "code": "KR",
        "name": "韩国",
        "english": "South Korea"
    },
    {
        "code": "CA",
        "name": "加拿大",
        "english": "Canada"
    },
    {
        "code": "AU",
        "name": "澳大利亚",
        "english": "Australia"
    },
    {
        "code": "SG",
        "name": "新加坡",
        "english": "Singapore"
    },
    {
        "code": "DE",
        "name": "德国",
        "english": "Germany"
    },
    {
        "code": "FR",
        "name": "法国",
        "english": "France"
    },
    {
        "code": "AL",
        "name": "阿尔巴尼亚",
        "english": "Albania"
    },
    {
        "code": "DZ",
        "name": "阿尔及利亚",
        "english": "Algeria"
    },
    {
        "code": "AF",
        "name": "阿富汗",
        "english": "Afghanistan"
    },
    {
        "code": "AR",
        "name": "阿根廷",
        "english": "Argentina"
    },
    {
        "code": "AE",
        "name": "阿拉伯联合酋长国",
        "english": "United Arab Emirates"
    },
    {
        "code": "AW",
        "name": "阿鲁巴",
        "english": "Aruba"
    },
    {
        "code": "OM",
        "name": "阿曼",
        "english": "Oman"
    },
    {
        "code": "AZ",
        "name": "阿塞拜疆",
        "english": "Azerbaijan"
    },
    {
        "code": "EG",
        "name": "埃及",
        "english": "Egypt"
    },
    {
        "code": "ET",
        "name": "埃塞俄比亚",
        "english": "Ethiopia"
    },
    {
        "code": "IE",
        "name": "爱尔兰",
        "english": "Ireland"
    },
    {
        "code": "EE",
        "name": "爱沙尼亚",
        "english": "Estonia"
    },
    {
        "code": "AD",
        "name": "安道尔",
        "english": "Andorra"
    },
    {
        "code": "AO",
        "name": "安哥拉",
        "english": "Angola"
    },
    {
        "code": "AI",
        "name": "安圭拉",
        "english": "Anguilla"
    },
    {
        "code": "AG",
        "name": "安提瓜和巴布达",
        "english": "Antigua & Barbuda"
    },
    {
        "code": "AT",
        "name": "奥地利",
        "english": "Austria"
    },
    {
        "code": "AX",
        "name": "奥兰群岛",
        "english": "Åland Islands"
    },
    {
        "code": "MO",
        "name": "澳门",
        "english": "Macao SAR China"
    },
    {
        "code": "BB",
        "name": "巴巴多斯",
        "english": "Barbados"
    },
    {
        "code": "PG",
        "name": "巴布亚新几内亚",
        "english": "Papua New Guinea"
    },
    {
        "code": "BS",
        "name": "巴哈马",
        "english": "Bahamas"
    },
    {
        "code": "PK",
        "name": "巴基斯坦",
        "english": "Pakistan"
    },
    {
        "code": "PY",
        "name": "巴拉圭",
        "english": "Paraguay"
    },
    {
        "code": "PS",
        "name": "巴勒斯坦领土",
        "english": "Palestinian Territories"
    },
    {
        "code": "BH",
        "name": "巴林",
        "english": "Bahrain"
    },
    {
        "code": "PA",
        "name": "巴拿马",
        "english": "Panama"
    },
    {
        "code": "BR",
        "name": "巴西",
        "english": "Brazil"
    },
    {
        "code": "BY",
        "name": "白俄罗斯",
        "english": "Belarus"
    },
    {
        "code": "BM",
        "name": "百慕大",
        "english": "Bermuda"
    },
    {
        "code": "BG",
        "name": "保加利亚",
        "english": "Bulgaria"
    },
    {
        "code": "MP",
        "name": "北马里亚纳群岛",
        "english": "Northern Mariana Islands"
    },
    {
        "code": "MK",
        "name": "北马其顿",
        "english": "North Macedonia"
    },
    {
        "code": "BJ",
        "name": "贝宁",
        "english": "Benin"
    },
    {
        "code": "BE",
        "name": "比利时",
        "english": "Belgium"
    },
    {
        "code": "IS",
        "name": "冰岛",
        "english": "Iceland"
    },
    {
        "code": "PR",
        "name": "波多黎各",
        "english": "Puerto Rico"
    },
    {
        "code": "PL",
        "name": "波兰",
        "english": "Poland"
    },
    {
        "code": "BA",
        "name": "波斯尼亚和黑塞哥维那",
        "english": "Bosnia & Herzegovina"
    },
    {
        "code": "BO",
        "name": "玻利维亚",
        "english": "Bolivia"
    },
    {
        "code": "BZ",
        "name": "伯利兹",
        "english": "Belize"
    },
    {
        "code": "BW",
        "name": "博茨瓦纳",
        "english": "Botswana"
    },
    {
        "code": "BT",
        "name": "不丹",
        "english": "Bhutan"
    },
    {
        "code": "BF",
        "name": "布基纳法索",
        "english": "Burkina Faso"
    },
    {
        "code": "BI",
        "name": "布隆迪",
        "english": "Burundi"
    },
    {
        "code": "BV",
        "name": "布韦岛",
        "english": "Bouvet Island"
    },
    {
        "code": "KP",
        "name": "朝鲜",
        "english": "North Korea"
    },
    {
        "code": "GQ",
        "name": "赤道几内亚",
        "english": "Equatorial Guinea"
    },
    {
        "code": "DK",
        "name": "丹麦",
        "english": "Denmark"
    },
    {
        "code": "TL",
        "name": "东帝汶",
        "english": "Timor-Leste"
    },
    {
        "code": "TG",
        "name": "多哥",
        "english": "Togo"
    },
    {
        "code": "DO",
        "name": "多米尼加共和国",
        "english": "Dominican Republic"
    },
    {
        "code": "DM",
        "name": "多米尼克",
        "english": "Dominica"
    },
    {
        "code": "RU",
        "name": "俄罗斯",
        "english": "Russia"
    },
    {
        "code": "EC",
        "name": "厄瓜多尔",
        "english": "Ecuador"
    },
    {
        "code": "ER",
        "name": "厄立特里亚",
        "english": "Eritrea"
    },
    {
        "code": "FO",
        "name": "法罗群岛",
        "english": "Faroe Islands"
    },
    {
        "code": "PF",
        "name": "法属波利尼西亚",
        "english": "French Polynesia"
    },
    {
        "code": "GF",
        "name": "法属圭亚那",
        "english": "French Guiana"
    },
    {
        "code": "TF",
        "name": "法属南部领地",
        "english": "French Southern Territories"
    },
    {
        "code": "MF",
        "name": "法属圣马丁",
        "english": "St. Martin"
    },
    {
        "code": "VA",
        "name": "梵蒂冈",
        "english": "Vatican City"
    },
    {
        "code": "PH",
        "name": "菲律宾",
        "english": "Philippines"
    },
    {
        "code": "FJ",
        "name": "斐济",
        "english": "Fiji"
    },
    {
        "code": "FI",
        "name": "芬兰",
        "english": "Finland"
    },
    {
        "code": "CV",
        "name": "佛得角",
        "english": "Cape Verde"
    },
    {
        "code": "FK",
        "name": "福克兰群岛",
        "english": "Falkland Islands"
    },
    {
        "code": "GM",
        "name": "冈比亚",
        "english": "Gambia"
    },
    {
        "code": "CG",
        "name": "刚果（布）",
        "english": "Congo - Brazzaville"
    },
    {
        "code": "CD",
        "name": "刚果（金）",
        "english": "Congo - Kinshasa"
    },
    {
        "code": "CO",
        "name": "哥伦比亚",
        "english": "Colombia"
    },
    {
        "code": "CR",
        "name": "哥斯达黎加",
        "english": "Costa Rica"
    },
    {
        "code": "GD",
        "name": "格林纳达",
        "english": "Grenada"
    },
    {
        "code": "GL",
        "name": "格陵兰",
        "english": "Greenland"
    },
    {
        "code": "GE",
        "name": "格鲁吉亚",
        "english": "Georgia"
    },
    {
        "code": "GG",
        "name": "根西岛",
        "english": "Guernsey"
    },
    {
        "code": "CU",
        "name": "古巴",
        "english": "Cuba"
    },
    {
        "code": "GP",
        "name": "瓜德罗普",
        "english": "Guadeloupe"
    },
    {
        "code": "GU",
        "name": "关岛",
        "english": "Guam"
    },
    {
        "code": "GY",
        "name": "圭亚那",
        "english": "Guyana"
    },
    {
        "code": "KZ",
        "name": "哈萨克斯坦",
        "english": "Kazakhstan"
    },
    {
        "code": "HT",
        "name": "海地",
        "english": "Haiti"
    },
    {
        "code": "NL",
        "name": "荷兰",
        "english": "Netherlands"
    },
    {
        "code": "BQ",
        "name": "荷属加勒比区",
        "english": "Caribbean Netherlands"
    },
    {
        "code": "SX",
        "name": "荷属圣马丁",
        "english": "Sint Maarten"
    },
    {
        "code": "HM",
        "name": "赫德岛和麦克唐纳群岛",
        "english": "Heard & McDonald Islands"
    },
    {
        "code": "ME",
        "name": "黑山",
        "english": "Montenegro"
    },
    {
        "code": "HN",
        "name": "洪都拉斯",
        "english": "Honduras"
    },
    {
        "code": "KI",
        "name": "基里巴斯",
        "english": "Kiribati"
    },
    {
        "code": "DJ",
        "name": "吉布提",
        "english": "Djibouti"
    },
    {
        "code": "KG",
        "name": "吉尔吉斯斯坦",
        "english": "Kyrgyzstan"
    },
    {
        "code": "GN",
        "name": "几内亚",
        "english": "Guinea"
    },
    {
        "code": "GW",
        "name": "几内亚比绍",
        "english": "Guinea-Bissau"
    },
    {
        "code": "GH",
        "name": "加纳",
        "english": "Ghana"
    },
    {
        "code": "GA",
        "name": "加蓬",
        "english": "Gabon"
    },
    {
        "code": "KH",
        "name": "柬埔寨",
        "english": "Cambodia"
    },
    {
        "code": "CZ",
        "name": "捷克",
        "english": "Czechia"
    },
    {
        "code": "ZW",
        "name": "津巴布韦",
        "english": "Zimbabwe"
    },
    {
        "code": "CM",
        "name": "喀麦隆",
        "english": "Cameroon"
    },
    {
        "code": "QA",
        "name": "卡塔尔",
        "english": "Qatar"
    },
    {
        "code": "KY",
        "name": "开曼群岛",
        "english": "Cayman Islands"
    },
    {
        "code": "CC",
        "name": "科科斯（基林）群岛",
        "english": "Cocos (Keeling) Islands"
    },
    {
        "code": "KM",
        "name": "科摩罗",
        "english": "Comoros"
    },
    {
        "code": "CI",
        "name": "科特迪瓦",
        "english": "Côte d’Ivoire"
    },
    {
        "code": "KW",
        "name": "科威特",
        "english": "Kuwait"
    },
    {
        "code": "HR",
        "name": "克罗地亚",
        "english": "Croatia"
    },
    {
        "code": "KE",
        "name": "肯尼亚",
        "english": "Kenya"
    },
    {
        "code": "CK",
        "name": "库克群岛",
        "english": "Cook Islands"
    },
    {
        "code": "CW",
        "name": "库拉索",
        "english": "Curaçao"
    },
    {
        "code": "LV",
        "name": "拉脱维亚",
        "english": "Latvia"
    },
    {
        "code": "LS",
        "name": "莱索托",
        "english": "Lesotho"
    },
    {
        "code": "LA",
        "name": "老挝",
        "english": "Laos"
    },
    {
        "code": "LB",
        "name": "黎巴嫩",
        "english": "Lebanon"
    },
    {
        "code": "LT",
        "name": "立陶宛",
        "english": "Lithuania"
    },
    {
        "code": "LR",
        "name": "利比里亚",
        "english": "Liberia"
    },
    {
        "code": "LY",
        "name": "利比亚",
        "english": "Libya"
    },
    {
        "code": "LI",
        "name": "列支敦士登",
        "english": "Liechtenstein"
    },
    {
        "code": "RE",
        "name": "留尼汪",
        "english": "Réunion"
    },
    {
        "code": "LU",
        "name": "卢森堡",
        "english": "Luxembourg"
    },
    {
        "code": "RW",
        "name": "卢旺达",
        "english": "Rwanda"
    },
    {
        "code": "RO",
        "name": "罗马尼亚",
        "english": "Romania"
    },
    {
        "code": "MG",
        "name": "马达加斯加",
        "english": "Madagascar"
    },
    {
        "code": "IM",
        "name": "马恩岛",
        "english": "Isle of Man"
    },
    {
        "code": "MV",
        "name": "马尔代夫",
        "english": "Maldives"
    },
    {
        "code": "MT",
        "name": "马耳他",
        "english": "Malta"
    },
    {
        "code": "MW",
        "name": "马拉维",
        "english": "Malawi"
    },
    {
        "code": "MY",
        "name": "马来西亚",
        "english": "Malaysia"
    },
    {
        "code": "ML",
        "name": "马里",
        "english": "Mali"
    },
    {
        "code": "MH",
        "name": "马绍尔群岛",
        "english": "Marshall Islands"
    },
    {
        "code": "MQ",
        "name": "马提尼克",
        "english": "Martinique"
    },
    {
        "code": "YT",
        "name": "马约特",
        "english": "Mayotte"
    },
    {
        "code": "MU",
        "name": "毛里求斯",
        "english": "Mauritius"
    },
    {
        "code": "MR",
        "name": "毛里塔尼亚",
        "english": "Mauritania"
    },
    {
        "code": "UM",
        "name": "美国本土外小岛屿",
        "english": "U.S. Outlying Islands"
    },
    {
        "code": "AS",
        "name": "美属萨摩亚",
        "english": "American Samoa"
    },
    {
        "code": "VI",
        "name": "美属维尔京群岛",
        "english": "U.S. Virgin Islands"
    },
    {
        "code": "MN",
        "name": "蒙古",
        "english": "Mongolia"
    },
    {
        "code": "MS",
        "name": "蒙特塞拉特",
        "english": "Montserrat"
    },
    {
        "code": "BD",
        "name": "孟加拉国",
        "english": "Bangladesh"
    },
    {
        "code": "PE",
        "name": "秘鲁",
        "english": "Peru"
    },
    {
        "code": "FM",
        "name": "密克罗尼西亚",
        "english": "Micronesia"
    },
    {
        "code": "MM",
        "name": "缅甸",
        "english": "Myanmar (Burma)"
    },
    {
        "code": "MD",
        "name": "摩尔多瓦",
        "english": "Moldova"
    },
    {
        "code": "MA",
        "name": "摩洛哥",
        "english": "Morocco"
    },
    {
        "code": "MC",
        "name": "摩纳哥",
        "english": "Monaco"
    },
    {
        "code": "MZ",
        "name": "莫桑比克",
        "english": "Mozambique"
    },
    {
        "code": "MX",
        "name": "墨西哥",
        "english": "Mexico"
    },
    {
        "code": "NA",
        "name": "纳米比亚",
        "english": "Namibia"
    },
    {
        "code": "ZA",
        "name": "南非",
        "english": "South Africa"
    },
    {
        "code": "AQ",
        "name": "南极洲",
        "english": "Antarctica"
    },
    {
        "code": "GS",
        "name": "南乔治亚和南桑威奇群岛",
        "english": "South Georgia & South Sandwich Islands"
    },
    {
        "code": "SS",
        "name": "南苏丹",
        "english": "South Sudan"
    },
    {
        "code": "NR",
        "name": "瑙鲁",
        "english": "Nauru"
    },
    {
        "code": "NI",
        "name": "尼加拉瓜",
        "english": "Nicaragua"
    },
    {
        "code": "NP",
        "name": "尼泊尔",
        "english": "Nepal"
    },
    {
        "code": "NE",
        "name": "尼日尔",
        "english": "Niger"
    },
    {
        "code": "NG",
        "name": "尼日利亚",
        "english": "Nigeria"
    },
    {
        "code": "NU",
        "name": "纽埃",
        "english": "Niue"
    },
    {
        "code": "NO",
        "name": "挪威",
        "english": "Norway"
    },
    {
        "code": "NF",
        "name": "诺福克岛",
        "english": "Norfolk Island"
    },
    {
        "code": "PW",
        "name": "帕劳",
        "english": "Palau"
    },
    {
        "code": "PN",
        "name": "皮特凯恩群岛",
        "english": "Pitcairn Islands"
    },
    {
        "code": "PT",
        "name": "葡萄牙",
        "english": "Portugal"
    },
    {
        "code": "SE",
        "name": "瑞典",
        "english": "Sweden"
    },
    {
        "code": "CH",
        "name": "瑞士",
        "english": "Switzerland"
    },
    {
        "code": "SV",
        "name": "萨尔瓦多",
        "english": "El Salvador"
    },
    {
        "code": "WS",
        "name": "萨摩亚",
        "english": "Samoa"
    },
    {
        "code": "RS",
        "name": "塞尔维亚",
        "english": "Serbia"
    },
    {
        "code": "SL",
        "name": "塞拉利昂",
        "english": "Sierra Leone"
    },
    {
        "code": "SN",
        "name": "塞内加尔",
        "english": "Senegal"
    },
    {
        "code": "CY",
        "name": "塞浦路斯",
        "english": "Cyprus"
    },
    {
        "code": "SC",
        "name": "塞舌尔",
        "english": "Seychelles"
    },
    {
        "code": "SA",
        "name": "沙特阿拉伯",
        "english": "Saudi Arabia"
    },
    {
        "code": "BL",
        "name": "圣巴泰勒米",
        "english": "St. Barthélemy"
    },
    {
        "code": "CX",
        "name": "圣诞岛",
        "english": "Christmas Island"
    },
    {
        "code": "ST",
        "name": "圣多美和普林西比",
        "english": "São Tomé & Príncipe"
    },
    {
        "code": "SH",
        "name": "圣赫勒拿",
        "english": "St. Helena"
    },
    {
        "code": "KN",
        "name": "圣基茨和尼维斯",
        "english": "St. Kitts & Nevis"
    },
    {
        "code": "LC",
        "name": "圣卢西亚",
        "english": "St. Lucia"
    },
    {
        "code": "SM",
        "name": "圣马力诺",
        "english": "San Marino"
    },
    {
        "code": "PM",
        "name": "圣皮埃尔和密克隆群岛",
        "english": "St. Pierre & Miquelon"
    },
    {
        "code": "VC",
        "name": "圣文森特和格林纳丁斯",
        "english": "St. Vincent & Grenadines"
    },
    {
        "code": "LK",
        "name": "斯里兰卡",
        "english": "Sri Lanka"
    },
    {
        "code": "SK",
        "name": "斯洛伐克",
        "english": "Slovakia"
    },
    {
        "code": "SI",
        "name": "斯洛文尼亚",
        "english": "Slovenia"
    },
    {
        "code": "SJ",
        "name": "斯瓦尔巴和扬马延",
        "english": "Svalbard & Jan Mayen"
    },
    {
        "code": "SZ",
        "name": "斯威士兰",
        "english": "Eswatini"
    },
    {
        "code": "SD",
        "name": "苏丹",
        "english": "Sudan"
    },
    {
        "code": "SR",
        "name": "苏里南",
        "english": "Suriname"
    },
    {
        "code": "SB",
        "name": "所罗门群岛",
        "english": "Solomon Islands"
    },
    {
        "code": "SO",
        "name": "索马里",
        "english": "Somalia"
    },
    {
        "code": "TJ",
        "name": "塔吉克斯坦",
        "english": "Tajikistan"
    },
    {
        "code": "TW",
        "name": "台湾",
        "english": "Taiwan"
    },
    {
        "code": "TH",
        "name": "泰国",
        "english": "Thailand"
    },
    {
        "code": "TZ",
        "name": "坦桑尼亚",
        "english": "Tanzania"
    },
    {
        "code": "TO",
        "name": "汤加",
        "english": "Tonga"
    },
    {
        "code": "TC",
        "name": "特克斯和凯科斯群岛",
        "english": "Turks & Caicos Islands"
    },
    {
        "code": "TT",
        "name": "特立尼达和多巴哥",
        "english": "Trinidad & Tobago"
    },
    {
        "code": "TN",
        "name": "突尼斯",
        "english": "Tunisia"
    },
    {
        "code": "TV",
        "name": "图瓦卢",
        "english": "Tuvalu"
    },
    {
        "code": "TR",
        "name": "土耳其",
        "english": "Türkiye"
    },
    {
        "code": "TM",
        "name": "土库曼斯坦",
        "english": "Turkmenistan"
    },
    {
        "code": "TK",
        "name": "托克劳",
        "english": "Tokelau"
    },
    {
        "code": "WF",
        "name": "瓦利斯和富图纳",
        "english": "Wallis & Futuna"
    },
    {
        "code": "VU",
        "name": "瓦努阿图",
        "english": "Vanuatu"
    },
    {
        "code": "GT",
        "name": "危地马拉",
        "english": "Guatemala"
    },
    {
        "code": "VE",
        "name": "委内瑞拉",
        "english": "Venezuela"
    },
    {
        "code": "BN",
        "name": "文莱",
        "english": "Brunei"
    },
    {
        "code": "UG",
        "name": "乌干达",
        "english": "Uganda"
    },
    {
        "code": "UA",
        "name": "乌克兰",
        "english": "Ukraine"
    },
    {
        "code": "UY",
        "name": "乌拉圭",
        "english": "Uruguay"
    },
    {
        "code": "UZ",
        "name": "乌兹别克斯坦",
        "english": "Uzbekistan"
    },
    {
        "code": "ES",
        "name": "西班牙",
        "english": "Spain"
    },
    {
        "code": "EH",
        "name": "西撒哈拉",
        "english": "Western Sahara"
    },
    {
        "code": "GR",
        "name": "希腊",
        "english": "Greece"
    },
    {
        "code": "HK",
        "name": "香港",
        "english": "Hong Kong SAR China"
    },
    {
        "code": "NC",
        "name": "新喀里多尼亚",
        "english": "New Caledonia"
    },
    {
        "code": "NZ",
        "name": "新西兰",
        "english": "New Zealand"
    },
    {
        "code": "HU",
        "name": "匈牙利",
        "english": "Hungary"
    },
    {
        "code": "SY",
        "name": "叙利亚",
        "english": "Syria"
    },
    {
        "code": "JM",
        "name": "牙买加",
        "english": "Jamaica"
    },
    {
        "code": "AM",
        "name": "亚美尼亚",
        "english": "Armenia"
    },
    {
        "code": "YE",
        "name": "也门",
        "english": "Yemen"
    },
    {
        "code": "IQ",
        "name": "伊拉克",
        "english": "Iraq"
    },
    {
        "code": "IR",
        "name": "伊朗",
        "english": "Iran"
    },
    {
        "code": "IL",
        "name": "以色列",
        "english": "Israel"
    },
    {
        "code": "IT",
        "name": "意大利",
        "english": "Italy"
    },
    {
        "code": "IN",
        "name": "印度",
        "english": "India"
    },
    {
        "code": "ID",
        "name": "印度尼西亚",
        "english": "Indonesia"
    },
    {
        "code": "VG",
        "name": "英属维尔京群岛",
        "english": "British Virgin Islands"
    },
    {
        "code": "IO",
        "name": "英属印度洋领地",
        "english": "British Indian Ocean Territory"
    },
    {
        "code": "JO",
        "name": "约旦",
        "english": "Jordan"
    },
    {
        "code": "VN",
        "name": "越南",
        "english": "Vietnam"
    },
    {
        "code": "ZM",
        "name": "赞比亚",
        "english": "Zambia"
    },
    {
        "code": "JE",
        "name": "泽西岛",
        "english": "Jersey"
    },
    {
        "code": "TD",
        "name": "乍得",
        "english": "Chad"
    },
    {
        "code": "GI",
        "name": "直布罗陀",
        "english": "Gibraltar"
    },
    {
        "code": "CL",
        "name": "智利",
        "english": "Chile"
    },
    {
        "code": "CF",
        "name": "中非共和国",
        "english": "Central African Republic"
    }
];
const index = new Map();
exports.COUNTRIES.forEach(country => [country.code, country.name, country.english].forEach(value => index.set(value.toLowerCase(), country)));
function countryFor(value) { return index.get(value.trim().toLowerCase()); }
