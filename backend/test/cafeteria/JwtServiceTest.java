package cafeteria;

import cafeteria.config.JwtProperties;
import cafeteria.service.JwtService;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class JwtServiceTest {

    @Test
    void shouldFailClearlyWhenJwtSecretIsShorterThan32Bytes() {
        JwtProperties properties = new JwtProperties();
        properties.setSecret("too-short");
        properties.setExpirationMs(86_400_000L);
        JwtService jwtService = new JwtService(properties);

        IllegalStateException exception = assertThrows(IllegalStateException.class,
                () -> jwtService.generateToken("user@example.invalid", "CLIENT"));

        assertTrue(exception.getMessage().contains("32 bytes"));
    }

    @Test
    void shouldGenerateTokenWhenJwtSecretIsAtLeast32Bytes() {
        JwtProperties properties = new JwtProperties();
        properties.setSecret("TEST_ONLY_0123456789_0123456789_ABCDE");
        properties.setExpirationMs(86_400_000L);
        JwtService jwtService = new JwtService(properties);

        String token = jwtService.generateToken("user@example.invalid", "CLIENT");

        assertEquals(3, token.split("\\.").length);
    }
}