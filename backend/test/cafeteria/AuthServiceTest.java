package cafeteria;

import cafeteria.dto.AuthRequest;
import cafeteria.dto.AuthResponse;
import cafeteria.entity.Role;
import cafeteria.entity.Usuario;
import cafeteria.repository.TiendaRepository;
import cafeteria.repository.UsuarioRepository;
import cafeteria.service.AuthService;
import cafeteria.service.JwtService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AuthServiceTest {

    @Mock
    private UsuarioRepository usuarioRepository;
    @Mock
    private TiendaRepository tiendaRepository;
    @Mock
    private PasswordEncoder passwordEncoder;
    @Mock
    private JwtService jwtService;

    @InjectMocks
    private AuthService authService;

    @Test
    void loginTrimsAndNormalizesEmailBeforeLookup() {
        Usuario usuario = Usuario.builder()
                .id("user-1")
                .nombre("Diego")
                .email("diego@example.invalid")
                .password("encoded-password")
                .role(Role.CLIENT)
                .activo(true)
                .build();
        AuthRequest request = new AuthRequest();
        request.setEmail("  DIEGO@EXAMPLE.INVALID  ");
        request.setPassword("test-password");

        when(usuarioRepository.findByEmail("diego@example.invalid")).thenReturn(Optional.of(usuario));
        when(passwordEncoder.matches("test-password", "encoded-password")).thenReturn(true);
        when(jwtService.generateToken("diego@example.invalid", "CLIENT")).thenReturn("test.jwt.token");

        AuthResponse response = authService.login(request);

        assertEquals("diego@example.invalid", response.getEmail());
        assertEquals("test.jwt.token", response.getToken());
        verify(usuarioRepository).findByEmail("diego@example.invalid");
    }
}