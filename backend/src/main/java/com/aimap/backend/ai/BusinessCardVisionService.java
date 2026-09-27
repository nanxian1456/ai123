package com.aimap.backend.ai;

import com.aimap.backend.error.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.stream.ImageInputStream;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Base64;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
public class BusinessCardVisionService {
    private static final int MAX_IMAGE_BYTES = 3 * 1024 * 1024;
    private final VisionProperties properties;
    private final AiExtractionService extraction;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;

    public BusinessCardVisionService(VisionProperties properties, AiExtractionService extraction, ObjectMapper objectMapper) {
        this.properties = properties;
        this.extraction = extraction;
        this.objectMapper = objectMapper;
        this.httpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(Math.max(1, properties.timeoutSeconds()))).build();
    }

    public AiExtractionResponse recognize(MultipartFile file) {
        if (file.isEmpty() || file.getSize() > MAX_IMAGE_BYTES) throw new ApiException(HttpStatus.BAD_REQUEST, "IMAGE_INVALID", "请选择不超过3MB的名片图片");
        String type = file.getContentType();
        if (!Set.of("image/jpeg", "image/png").contains(type)) throw new ApiException(HttpStatus.BAD_REQUEST, "IMAGE_INVALID", "仅支持JPG或PNG图片");
        try (InputStream input = file.getInputStream(); ImageInputStream image = ImageIO.createImageInputStream(input)) {
            if (image == null) throw new ApiException(HttpStatus.BAD_REQUEST, "IMAGE_INVALID", "图片文件无效");
            Iterator<ImageReader> readers = ImageIO.getImageReaders(image);
            if (!readers.hasNext()) throw new ApiException(HttpStatus.BAD_REQUEST, "IMAGE_INVALID", "图片文件无效");
            readers.next().dispose();
        } catch (ApiException exception) { throw exception; }
        catch (Exception exception) { throw new ApiException(HttpStatus.BAD_REQUEST, "IMAGE_INVALID", "图片文件无效"); }
        if (!properties.configured()) throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "VISION_NOT_CONFIGURED", "名片图片识别尚未配置视觉模型");

        try {
            String imageUrl = "data:" + type + ";base64," + Base64.getEncoder().encodeToString(file.getBytes());
            String body = objectMapper.writeValueAsString(Map.of("model", properties.model(), "temperature", 0,
                    "messages", List.of(
                            Map.of("role", "system", "content", "识别名片上的信息。只返回JSON对象，字段为name、organization、position、province、city、phone、email、note、tags。无法确定的字段留空，不要编造。"),
                            Map.of("role", "user", "content", List.of(
                                    Map.of("type", "text", "text", "提取这张名片的信息"),
                                    Map.of("type", "image_url", "image_url", Map.of("url", imageUrl))
                            )))));
            String base = properties.baseUrl().replaceAll("/+$", "");
            URI endpoint = URI.create(base.endsWith("/chat/completions") ? base : base + "/chat/completions");
            HttpRequest request = HttpRequest.newBuilder(endpoint)
                    .timeout(Duration.ofSeconds(Math.max(1, properties.timeoutSeconds())))
                    .header("Authorization", "Bearer " + properties.apiKey())
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(body)).build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) throw new ApiException(HttpStatus.BAD_GATEWAY, "VISION_PROVIDER_ERROR", "图片识别服务暂不可用");
            JsonNode root = objectMapper.readTree(response.body());
            String content = root.path("choices").path(0).path("message").path("content").asText("");
            if (content.isBlank()) throw new IllegalArgumentException("Empty vision response");
            return new AiExtractionResponse("vision", "名片识别完成，请核对后保存", extraction.parseContent(content, ""));
        } catch (ApiException exception) { throw exception; }
        catch (InterruptedException exception) { Thread.currentThread().interrupt(); throw new ApiException(HttpStatus.BAD_GATEWAY, "VISION_INTERRUPTED", "图片识别请求已中断"); }
        catch (Exception exception) { throw new ApiException(HttpStatus.BAD_GATEWAY, "VISION_RESPONSE_INVALID", "图片识别结果无效，请稍后重试"); }
    }
}
