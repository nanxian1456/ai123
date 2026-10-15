"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const api_1 = require("../../utils/api");
const VISIBILITY_FIELDS = [
    { field: "nickname", label: "昵称" },
    { field: "organization", label: "单位" },
    { field: "position", label: "职务" },
    { field: "city", label: "城市" },
    { field: "bio", label: "个人简介" },
];
const PRIVATE_VISIBILITY = {
    avatar: false,
    nickname: false,
    organization: false,
    position: false,
    city: false,
    bio: false,
};
const normalizeProfile = (profile) => ({
    ...profile,
    visibility: { ...PRIVATE_VISIBILITY, ...(profile.visibility || {}) },
});
const visibilityItems = (visibility) => VISIBILITY_FIELDS.map((item) => ({
    ...item,
    enabled: visibility[item.field],
}));
Page({
    data: {
        profile: null,
        visibilityItems: [],
        savingVisibility: false,
    },
    onShow() {
        this.load();
    },
    async load() {
        try {
            const profile = normalizeProfile(await (0, api_1.request)("/me"));
            this.setData({
                profile,
                visibilityItems: visibilityItems(profile.visibility),
            });
        }
        catch (error) {
            (0, api_1.showError)(error);
        }
    },
    async retryPublication() {
        if (this.data.savingVisibility || !this.data.profile)
            return;
        this.setData({ savingVisibility: true });
        try {
            await (0, api_1.syncPublishedProfile)(this.data.profile);
        }
        catch (error) {
            (0, api_1.showError)(error);
        }
        finally {
            await this.load();
            this.setData({ savingVisibility: false });
        }
    },
    changeVisibility(event) {
        if (this.data.savingVisibility || !this.data.profile)
            return;
        const visibility = {
            ...this.data.profile.visibility,
            [event.currentTarget.dataset.field]: event.detail.value,
        };
        this.setData({
            "profile.visibility": visibility,
            visibilityItems: visibilityItems(visibility),
            savingVisibility: true,
        });
        (0, api_1.request)("/me/visibility", "PATCH", visibility)
            .then((profile) => {
            const normalized = normalizeProfile(profile);
            this.setData({
                profile: normalized,
                visibilityItems: visibilityItems(normalized.visibility),
            });
        })
            .catch((error) => {
            this.load();
            (0, api_1.showError)(error);
        })
            .finally(() => this.setData({ savingVisibility: false }));
    },
});
