package com.aimap.backend;

import com.aimap.backend.auth.AuthProperties;
import com.aimap.backend.auth.WechatProperties;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
@EnableConfigurationProperties({AuthProperties.class, WechatProperties.class})
public class AiNetworkBackendApplication {

	public static void main(String[] args) {
		SpringApplication.run(AiNetworkBackendApplication.class, args);
	}

}
