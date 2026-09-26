package cafeteria.controller;

import cafeteria.dto.ProductoResponse;
import cafeteria.entity.Role;
import cafeteria.entity.Tienda;
import cafeteria.entity.Usuario;
import cafeteria.repository.TiendaRepository;
import cafeteria.repository.ProductoRepository;
import cafeteria.repository.UsuarioRepository;
import cafeteria.service.CatalogoService;
import cafeteria.service.JwtService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.List;

@RestController
@RequestMapping("/api/restaurants")
@RequiredArgsConstructor
public class RestaurantOperationsController {

    private final CatalogoService catalogoService;
    private final TiendaRepository tiendaRepository;
    private final ProductoRepository productoRepository;
    private final UsuarioRepository usuarioRepository;
    private final JwtService jwtService;

    @GetMapping("/{tiendaId}/inventory")
    public List<ProductoResponse> inventory(
            @PathVariable String tiendaId,
            @RequestHeader(value = "Authorization", required = false) String authorization
    ) {
        authorizeStore(tiendaId, authorization);
        return catalogoService.listarInventario(tiendaId);
    }

    @GetMapping("/{tiendaId}")
    public Tienda storeStatus(
            @PathVariable String tiendaId,
            @RequestHeader(value = "Authorization", required = false) String authorization
    ) {
        authorizeStore(tiendaId, authorization);
        return getStore(tiendaId);
    }

    @PostMapping("/{tiendaId}/heartbeat")
    public void heartbeat(
            @PathVariable String tiendaId,
            @RequestHeader(value = "Authorization", required = false) String authorization
    ) {
        authorizeStore(tiendaId, authorization);
        Tienda tienda = getStore(tiendaId);
        tienda.setUltimaConexion(LocalDateTime.now());
        tiendaRepository.save(tienda);
    }

    @PatchMapping("/{tiendaId}/inventory/{productoId}")
    public ProductoResponse updateInventory(
            @PathVariable String tiendaId,
            @PathVariable String productoId,
            @Valid @RequestBody InventoryUpdate update,
            @RequestHeader(value = "Authorization", required = false) String authorization
    ) {
        authorizeStore(tiendaId, authorization);
        var existingProduct = productoRepository.findById(productoId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Producto no encontrado."));
        if (!tiendaId.equals(existingProduct.getTiendaId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "El producto no pertenece a esta tienda.");
        }
        ProductoResponse producto = catalogoService.actualizarDisponibilidad(productoId, update.stock(), update.activo());
        return producto;
    }

    @PatchMapping("/{tiendaId}/orders")
    public Tienda updateOrderAvailability(
            @PathVariable String tiendaId,
            @Valid @RequestBody OrderAvailability update,
            @RequestHeader(value = "Authorization", required = false) String authorization
    ) {
        authorizeStore(tiendaId, authorization);
        Tienda tienda = getStore(tiendaId);
        tienda.setAceptaPedidos(update.aceptaPedidos());
        return tiendaRepository.save(tienda);
    }

    private void authorizeStore(String tiendaId, String authorization) {
        if (authorization == null || !authorization.startsWith("Bearer ")) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Se requiere una sesión válida.");
        }
        String token = authorization.substring(7);
        try {
            if (!jwtService.isTokenValid(token)) {
                throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "La sesión expiró.");
            }
            String role = jwtService.extractRole(token);
            if (Role.ADMIN.name().equals(role)) {
                return;
            }
            Usuario usuario = usuarioRepository.findByEmail(jwtService.extractEmail(token))
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Usuario no encontrado."));
            if (Role.RESTAURANT.name().equals(role) && tiendaId.equals(usuario.getTiendaId())) {
                return;
            }
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "No tienes acceso a esta tienda.");
        } catch (ResponseStatusException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "La sesión no es válida.");
        }
    }

    private Tienda getStore(String tiendaId) {
        return tiendaRepository.findById(tiendaId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Tienda no encontrada."));
    }

    public record InventoryUpdate(@Min(0) Integer stock, Boolean activo) {
    }

    public record OrderAvailability(@NotNull Boolean aceptaPedidos) {
    }
}
