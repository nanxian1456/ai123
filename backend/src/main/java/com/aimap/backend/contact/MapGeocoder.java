package com.aimap.backend.contact;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class MapGeocoder {
    private final String key;
    private final HttpClient client;
    private final URI endpoint;
    private final ObjectMapper mapper;
    private final Map<String, Location> cache = new ConcurrentHashMap<>();

    @Autowired
    public MapGeocoder(@Value("${map.tencent.key:}") String key, ObjectMapper mapper) {
        this(key, mapper, HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build(),
                URI.create("https://apis.map.qq.com/ws/geocoder/v1/"));
    }

    MapGeocoder(String key, ObjectMapper mapper, HttpClient client, URI endpoint) {
        this.key = key;
        this.mapper = mapper;
        this.client = client;
        this.endpoint = endpoint;
        if (key == null || key.isBlank()) {
            System.err.println("[MapGeocoder] 腾讯位置服务 WebService Key 未配置，地图定位将不可用。请设置环境变量 TENCENT_MAP_KEY 或在 application-local.properties 中配置 map.tencent.key=你的Key");
        }
    }

    public Location locate(String address) {
        if (key == null || key.isBlank()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "腾讯位置服务 Key 未配置：请设置环境变量 TENCENT_MAP_KEY 或在 application-local.properties 中配置 map.tencent.key=你的Key");
        }
        if (address == null || address.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "地区名称不能为空");
        }
        Location cached = cache.get(address);
        if (cached != null) return cached;
        try {
            String query = "address=" + URLEncoder.encode(address, StandardCharsets.UTF_8)
                    + "&key=" + URLEncoder.encode(key, StandardCharsets.UTF_8);
            URI uri = URI.create(endpoint + "?" + query);
            HttpRequest request = HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(8)).GET().build();
            HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() != 200) throw unavailable();
            JsonNode body = mapper.readTree(response.body());
            JsonNode point = body.path("result").path("location");
            int status = body.path("status").asInt(-1);
            if (status == 121) {
                throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "腾讯位置服务今日调用量已达上限，请额度恢复后重试");
            }
            if (status != 0) {
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "腾讯位置服务定位失败（错误码 " + status + "）");
            }
            if (!point.path("lat").isNumber() || !point.path("lng").isNumber()) throw unavailable();
            double latitude = point.path("lat").asDouble();
            double longitude = point.path("lng").asDouble();
            if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) throw unavailable();
            Location result = new Location(latitude, longitude);
            cache.putIfAbsent(address, result);
            return result;
        } catch (ResponseStatusException exception) {
            throw exception;
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw unavailable();
        } catch (Exception exception) {
            throw unavailable();
        }
    }

    private ResponseStatusException unavailable() {
        return new ResponseStatusException(HttpStatus.BAD_GATEWAY, "地图定位服务暂不可用");
    }

    public record Location(double latitude, double longitude) {}
}
