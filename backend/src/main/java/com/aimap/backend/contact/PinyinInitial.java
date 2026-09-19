package com.aimap.backend.contact;

import net.sourceforge.pinyin4j.PinyinHelper;

import java.util.Locale;

final class PinyinInitial {
    private PinyinInitial() { }

    static String of(String name) {
        if (name == null || name.isBlank()) return "#";
        char first = name.trim().charAt(0);
        if (first <= 127 && Character.isLetter(first)) return String.valueOf(first).toUpperCase(Locale.ROOT);
        String[] pinyin = PinyinHelper.toHanyuPinyinStringArray(first);
        if (pinyin != null && pinyin.length > 0 && !pinyin[0].isBlank()) return String.valueOf(Character.toUpperCase(pinyin[0].charAt(0)));
        return "#";
    }
}
