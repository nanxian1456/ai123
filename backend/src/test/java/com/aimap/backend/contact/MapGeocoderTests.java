package com.aimap.backend.contact;

import tools.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.net.http.HttpClient;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class MapGeocoderTests {
    private HttpServer server;

    @AfterEach
    void stopServer() { if (server != null) server.stop(0); }

    @Test
    void requiresServerSideKey() {
        MapGeocoder geocoder = new MapGeocoder("", new ObjectMapper());
        ResponseStatusException error = assertThrows(ResponseStatusException.class, () -> geocoder.locate("中国"));
        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, error.getStatusCode());
    }

    @Test
    void encodesAddressAndCachesSuccessfulLocation() throws Exception {
        AtomicInteger calls = new AtomicInteger();
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/geocode", exchange -> {
            calls.incrementAndGet();
            assertEquals("address=%E4%B8%AD%E5%9B%BD+%E6%B1%9F%E8%8B%8F&key=private-key", exchange.getRequestURI().getRawQuery());
            byte[] body = "{\"status\":0,\"result\":{\"location\":{\"lat\":32.06,\"lng\":118.79}}}".getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200, body.length);
            try (var output = exchange.getResponseBody()) { output.write(body); }
        });
        server.start();
        MapGeocoder geocoder = new MapGeocoder("private-key", new ObjectMapper(), HttpClient.newHttpClient(),
                java.net.URI.create("http://127.0.0.1:" + server.getAddress().getPort() + "/geocode"));
        assertEquals(new MapGeocoder.Location(32.06, 118.79), geocoder.locate("中国 江苏"));
        assertEquals(new MapGeocoder.Location(32.06, 118.79), geocoder.locate("中国 江苏"));
        assertEquals(1, calls.get());
    }

    @Test
    void reportsUpstreamFailure() throws Exception {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/geocode", exchange -> {
            byte[] body = "{\"status\":347,\"message\":\"invalid key\"}".getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200, body.length);
            try (var output = exchange.getResponseBody()) { output.write(body); }
        });
        server.start();
        MapGeocoder geocoder = new MapGeocoder("invalid", new ObjectMapper(), HttpClient.newHttpClient(),
                java.net.URI.create("http://127.0.0.1:" + server.getAddress().getPort() + "/geocode"));
        ResponseStatusException error = assertThrows(ResponseStatusException.class, () -> geocoder.locate("中国"));
        assertEquals(HttpStatus.BAD_GATEWAY, error.getStatusCode());
    }

    @Test
    void reportsExhaustedDailyQuota() throws Exception {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/geocode", exchange -> {
            byte[] body = "{\"status\":121,\"message\":\"daily limit reached\"}".getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200, body.length);
            try (var output = exchange.getResponseBody()) { output.write(body); }
        });
        server.start();
        MapGeocoder geocoder = new MapGeocoder("private-key", new ObjectMapper(), HttpClient.newHttpClient(),
                java.net.URI.create("http://127.0.0.1:" + server.getAddress().getPort() + "/geocode"));
        ResponseStatusException error = assertThrows(ResponseStatusException.class, () -> geocoder.locate("南京市"));
        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, error.getStatusCode());
    }
}
