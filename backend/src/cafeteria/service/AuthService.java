package cafeteria.service;

import cafeteria.dto.AuthRequest;
import cafeteria.dto.AuthResponse;
import cafeteria.dto.RegistroUsuarioRequest;
import cafeteria.entity.Role;
import cafeteria.entity.Usuario;
import cafeteria.exception.ApiException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import cafeteria.repository.TiendaRepository;
import cafeteria.repository.UsuarioRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.util.Locale;

@Service
@RequiredArgsConstructor
public class AuthService {

    private final UsuarioRepository usuarioRepository;
    private final TiendaRepository tiendaRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;

    public AuthResponse registrar(RegistroUsuarioRequest request) {
        String email = request.getEmail().trim().toLowerCase(Locale.ROOT);
        if (usuarioRepository.existsByEmail(email)) {
            throw ApiException.conflict("Ya existe un usuario registrado con ese correo.");
        }

        boolean isRestaurant = Boolean.TRUE.equals(request.getIsRestaurant());
        String matricula = request.getMatricula() == null ? null : request.getMatricula().trim();
        String tiendaId = null;
        if (isRestaurant) {
            if (matricula == null || matricula.isBlank()) {
                throw new ApiException("El código de la tienda es obligatorio para registrar una cuenta de restaurante.");
            }
            tiendaId = tiendaRepository.findBySlugIgnoreCase(matricula)
                    .map(tienda -> tienda.getId())
                    .orElseThrow(() -> new ApiException("No se encontró una tienda con ese código.", HttpStatus.BAD_REQUEST));
        }

        Usuario usuario = Usuario.builder()
                .nombre(request.getNombre())
                .email(email)
                .password(passwordEncoder.encode(request.getPassword()))
                .role(isRestaurant ? Role.RESTAURANT : Role.CLIENT)
                .matricula(matricula)
                .tiendaId(tiendaId)
                .build();

        String token = jwtService.generateToken(email, usuario.getRole().name());
        try {
            usuario = usuarioRepository.save(usuario);
        } catch (DuplicateKeyException exception) {
            throw ApiException.conflict("Ya existe un usuario registrado con ese correo.");
        }

        return AuthResponse.builder()
                .id(usuario.getId())
                .token(token)
                .email(usuario.getEmail())
                .nombre(usuario.getNombre())
                .role(usuario.getRole().name())
                .tiendaId(usuario.getTiendaId())
                .build();
    }

    public AuthResponse login(AuthRequest request) {
        String email = request.getEmail().trim().toLowerCase(Locale.ROOT);
        Usuario usuario = usuarioRepository.findByEmail(email)
                .orElseThrow(() -> ApiException.unauthorized("Credenciales inválidas."));

        if (Boolean.FALSE.equals(usuario.getActivo())
            || !passwordEncoder.matches(request.getPassword(), usuario.getPassword())) {
            throw ApiException.unauthorized("Credenciales inválidas.");
        }

        String token = jwtService.generateToken(usuario.getEmail(), usuario.getRole().name());

        return AuthResponse.builder()
                .id(usuario.getId())
                .token(token)
                .email(usuario.getEmail())
                .nombre(usuario.getNombre())
                .role(usuario.getRole().name())
                .tiendaId(usuario.getTiendaId())
                .build();
    }
}
