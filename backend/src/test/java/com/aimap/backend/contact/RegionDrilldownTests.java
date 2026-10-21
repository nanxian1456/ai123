package com.aimap.backend.contact;

import com.aimap.backend.ai.AiExtractionService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;

@SpringBootTest(properties = {
        "auth.token-secret=test-only-token-secret-not-for-production",
        "spring.datasource.url=jdbc:h2:mem:region_drilldown_test;DB_CLOSE_DELAY=-1",
        "map.tencent.key=",
        "demo-data.enabled=false"
})
class RegionDrilldownTests {
    @Autowired ContactService contacts;
    @Autowired InsightController insights;
    @Autowired ContactController directory;

    @Test
    void groupsByFullRegionAndFiltersContactsWithinCurrentOwner() {
        contacts.save("owner-map", contact("甲", "南京", "江苏", "中国"));
        contacts.save("owner-map", contact("乙", "南京", "广东", "中国"));
        contacts.save("owner-map", contact("丙", "南京", "江苏", "中国"));
        contacts.save("owner-map", contact("丁", "南京", "", ""));
        contacts.save("other-owner", contact("戊", "南京", "江苏", "中国"));

        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setAttribute("currentOpenId", "owner-map");
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request));
        try {
            assertEquals(List.of(region("中国", 3), region("", 1)), insights.regions("country", "", "", false));
            assertEquals(List.of(region("江苏", 2), region("广东", 1)), insights.regions("province", "中国", "", false));
            assertEquals(List.of(region("南京", 2)), insights.regions("city", "中国", "江苏", false));
            assertEquals(List.of(region("", 1)), insights.regions("province", "", "", false));
            assertEquals(List.of(region("南京", 1)), insights.regions("city", "", "", false));
            assertEquals(2, directory.directory("", "南京", "", "中国", "江苏").size());
            assertEquals(1, directory.directory("", "南京", "", "", "").size());
            assertEquals(4, directory.directory("", "南京", "", null, null).size());
            assertThrows(org.springframework.web.server.ResponseStatusException.class,
                    () -> insights.regions("invalid", "", "", false));
            assertEquals(org.springframework.http.HttpStatus.BAD_REQUEST,
                    assertThrows(org.springframework.web.server.ResponseStatusException.class,
                            () -> insights.locations("province", "", "", "")).getStatusCode());
            Map<String, Object> chinaLocations = insights.locations("province", "中国", "", "");
            assertEquals(new MapGeocoder.Location(35.86, 104.20), chinaLocations.get("center"));
            assertEquals(2, ((List<?>) chinaLocations.get("markers")).size());
            Map<String, Object> jiangsuLocations = insights.locations("city", "中国", "江苏", "");
            assertEquals(new MapGeocoder.Location(32.06, 118.80), jiangsuLocations.get("center"));
            Map<?, ?> nanjing = (Map<?, ?>) ((List<?>) jiangsuLocations.get("markers")).getFirst();
            assertEquals(32.06, nanjing.get("latitude"));
            assertEquals(118.80, nanjing.get("longitude"));
        } finally {
            RequestContextHolder.resetRequestAttributes();
        }
    }

    @Test
    void selectedCityUsesCityCenter() {
        MapGeocoder geocoder = mock(MapGeocoder.class);
        InsightController controller = new InsightController(
                mock(ContactService.class), mock(InsightService.class), mock(AiExtractionService.class), geocoder);
        assertEquals(Map.of("center", new MapGeocoder.Location(32.06, 118.80), "markers", List.of()),
                controller.locations("city", "中国", "江苏省", "南京市"));
        org.mockito.Mockito.verifyNoInteractions(geocoder);
    }

    private ContactRequest contact(String name, String city, String province, String country) {
        return new ContactRequest(name, "", "", city, "", null, null, province, country, "", "", "", List.of());
    }

    private Map<String, Object> region(String name, long count) {
        return Map.of("name", name, "count", count);
    }
}
