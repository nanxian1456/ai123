"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const api_1 = require("../../utils/api");
Page({ data: { cities: [], total: 0, topCity: "--" }, onShow() { this.load(); }, async load() { try {
        const cities = await (0, api_1.request)("/maps/cities");
        const total = cities.reduce((sum, city) => sum + city.count, 0);
        const sorted = cities.slice().sort((a, b) => b.count - a.count).map(city => ({ ...city, percent: total ? Math.round(city.count / total * 100) : 0 }));
        this.setData({ cities: sorted, total, topCity: sorted[0]?.name || "--" });
    }
    catch (error) {
        (0, api_1.showError)(error);
    } }, contacts(event) { wx.setStorageSync("contact-filter-city", event.currentTarget.dataset.city); wx.switchTab({ url: "/pages/contacts/index" }); } });
