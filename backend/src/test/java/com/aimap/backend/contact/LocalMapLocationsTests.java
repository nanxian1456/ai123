package com.aimap.backend.contact;

import com.aimap.backend.ai.AiExtractionService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class LocalMapLocationsTests {
    private ContactService contacts;
    private MapGeocoder geocoder;
    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        contacts = mock(ContactService.class);
        geocoder = mock(MapGeocoder.class);
        mvc = MockMvcBuilders.standaloneSetup(new InsightController(contacts,
                mock(InsightService.class), mock(AiExtractionService.class), geocoder)).build();
    }

    @Test
    void resolvesOnlyRegionsFromThePhoneWithoutReadingServerContacts() throws Exception {
        mvc.perform(post("/api/maps/locations").contentType(MediaType.APPLICATION_JSON).content("""
                {"level":"province","country":"中国","province":"","city":"","regions":["江苏","广东"]}
                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.center.latitude").value(35.86))
                .andExpect(jsonPath("$.markers.length()").value(2))
                .andExpect(jsonPath("$.markers[0].name").value("江苏"))
                .andExpect(jsonPath("$.markers[0].latitude").value(32.06))
                .andExpect(jsonPath("$.markers[0].count").doesNotExist());
        verifyNoInteractions(contacts, geocoder);
    }

    @Test
    void anEmptyLocalRegionListNeverFallsBackToServerContacts() throws Exception {
        mvc.perform(post("/api/maps/locations").contentType(MediaType.APPLICATION_JSON).content("""
                {"level":"city","country":"中国","province":"江苏","city":"南京","regions":[]}
                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.center.longitude").value(118.80))
                .andExpect(jsonPath("$.markers").isEmpty());
        verifyNoInteractions(contacts, geocoder);
    }

    @Test
    void rejectsInvalidOrUnboundedLocationRequestsBeforeCallingTheProvider() throws Exception {
        String tooMany = String.join(",", java.util.Collections.nCopies(31, "\"江苏\""));
        for (String body : new String[]{
                "{\"level\":\"province\",\"country\":\"\",\"regions\":[]}",
                "{\"level\":\"unknown\",\"country\":\"中国\",\"regions\":[]}",
                "{\"level\":\"city\",\"country\":\"中国\",\"province\":\"\",\"regions\":[]}",
                "{\"level\":\"province\",\"country\":\"中国\",\"regions\":[\"\"]}",
                "{\"level\":\"province\",\"country\":\"中国\",\"regions\":[" + tooMany + "]}"}) {
            mvc.perform(post("/api/maps/locations").contentType(MediaType.APPLICATION_JSON).content(body))
                    .andExpect(status().isBadRequest());
        }
        verifyNoInteractions(contacts, geocoder);
    }
}
