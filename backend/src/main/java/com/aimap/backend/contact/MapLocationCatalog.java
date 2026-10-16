package com.aimap.backend.contact;

import java.util.Map;

final class MapLocationCatalog {
    private static final Map<String, MapGeocoder.Location> CHINA_PROVINCES = Map.ofEntries(
            Map.entry("北京", point(39.90, 116.40)), Map.entry("天津", point(39.08, 117.20)),
            Map.entry("河北", point(38.04, 114.51)), Map.entry("山西", point(37.87, 112.55)),
            Map.entry("内蒙古", point(40.82, 111.65)), Map.entry("辽宁", point(41.80, 123.43)),
            Map.entry("吉林", point(43.82, 125.32)), Map.entry("黑龙江", point(45.75, 126.63)),
            Map.entry("上海", point(31.23, 121.47)), Map.entry("江苏", point(32.06, 118.80)),
            Map.entry("浙江", point(30.27, 120.15)), Map.entry("安徽", point(31.82, 117.23)),
            Map.entry("福建", point(26.07, 119.30)), Map.entry("江西", point(28.68, 115.86)),
            Map.entry("山东", point(36.65, 117.12)), Map.entry("河南", point(34.75, 113.62)),
            Map.entry("湖北", point(30.59, 114.30)), Map.entry("湖南", point(28.23, 112.94)),
            Map.entry("广东", point(23.13, 113.26)), Map.entry("广西", point(22.82, 108.32)),
            Map.entry("海南", point(20.02, 110.35)), Map.entry("重庆", point(29.56, 106.55)),
            Map.entry("四川", point(30.57, 104.07)), Map.entry("贵州", point(26.65, 106.63)),
            Map.entry("云南", point(25.04, 102.71)), Map.entry("西藏", point(29.65, 91.14)),
            Map.entry("陕西", point(34.34, 108.94)), Map.entry("甘肃", point(36.06, 103.83)),
            Map.entry("青海", point(36.62, 101.78)), Map.entry("宁夏", point(38.49, 106.23)),
            Map.entry("新疆", point(43.83, 87.62)), Map.entry("香港", point(22.32, 114.17)),
            Map.entry("澳门", point(22.20, 113.54)), Map.entry("台湾", point(25.03, 121.57))
    );

    private static final Map<String, MapGeocoder.Location> JIANGSU_CITIES = Map.ofEntries(
            Map.entry("南京", point(32.06, 118.80)), Map.entry("苏州", point(31.30, 120.59)),
            Map.entry("无锡", point(31.49, 120.31)), Map.entry("常州", point(31.81, 119.97)),
            Map.entry("镇江", point(32.20, 119.45)), Map.entry("扬州", point(32.39, 119.41)),
            Map.entry("泰州", point(32.46, 119.92)), Map.entry("南通", point(31.98, 120.89)),
            Map.entry("盐城", point(33.35, 120.16)), Map.entry("淮安", point(33.61, 119.02)),
            Map.entry("宿迁", point(33.96, 118.28)), Map.entry("徐州", point(34.20, 117.28)),
            Map.entry("连云港", point(34.60, 119.22))
    );

    private MapLocationCatalog() { }

    static MapGeocoder.Location locate(String country, String province, String city) {
        if (!isChina(country)) return null;
        if (province.isBlank()) return point(35.86, 104.20);
        MapGeocoder.Location provinceCenter = CHINA_PROVINCES.get(normalize(province));
        if (provinceCenter == null || city.isBlank()) return provinceCenter;
        if (normalize(province).equals("江苏")) return JIANGSU_CITIES.getOrDefault(normalize(city), provinceCenter);
        return provinceCenter;
    }

    static MapGeocoder.Location locateProvince(String country, String province) {
        return isChina(country) ? CHINA_PROVINCES.get(normalize(province)) : null;
    }

    static MapGeocoder.Location locateCity(String country, String province, String city) {
        if (!isChina(country) || !normalize(province).equals("江苏")) return null;
        return JIANGSU_CITIES.get(normalize(city));
    }

    private static boolean isChina(String country) {
        return country.equals("中国") || country.equalsIgnoreCase("China");
    }

    private static String normalize(String value) {
        return value.replaceAll("(省|市|自治区|特别行政区)$", "");
    }

    private static MapGeocoder.Location point(double latitude, double longitude) {
        return new MapGeocoder.Location(latitude, longitude);
    }
}
