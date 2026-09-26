package cafeteria;

import cafeteria.config.CorsProperties;
import cafeteria.config.SecurityConfig;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SecurityConfigTest {

    @Test
    void corsKeepsRequiredOriginsWhenRenderHasAnOlderCustomOrigin() {
        CorsProperties properties = new CorsProperties();
        properties.setOrigins(List.of("https://old-frontend.example.com"));

        CorsConfigurationSource source = new SecurityConfig().corsConfigurationSource(properties);
        MockHttpServletRequest request = new MockHttpServletRequest("OPTIONS", "/api/auth/login");
        CorsConfiguration configuration = source.getCorsConfiguration(request);

        assertNotNull(configuration);
        assertTrue(configuration.getAllowedOrigins().containsAll(List.of(
            "https://tecmipickup-appp.vercel.app",
            "http://localhost:5173",
            "http://localhost:3000",
            "https://old-frontend.example.com")));
        assertTrue(configuration.getAllowedMethods().containsAll(
                List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS")));
        assertTrue(configuration.getAllowedHeaders().contains("*"));
        assertEquals(Boolean.TRUE, configuration.getAllowCredentials());
    }
}