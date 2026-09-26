package cafeteria.controller;

import cafeteria.entity.Pedido;
import cafeteria.entity.PedidoEstado;
import cafeteria.entity.Producto;
import cafeteria.entity.Role;
import cafeteria.entity.Tienda;
import cafeteria.entity.Usuario;
import cafeteria.repository.PedidoRepository;
import cafeteria.repository.ProductoRepository;
import cafeteria.repository.TiendaRepository;
import cafeteria.repository.UsuarioRepository;
import cafeteria.service.JwtService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;

@RestController
@RequestMapping("/api/admin")
@RequiredArgsConstructor
public class AdminDashboardController {

    private final TiendaRepository tiendaRepository;
    private final ProductoRepository productoRepository;
    private final PedidoRepository pedidoRepository;
    private final UsuarioRepository usuarioRepository;
    private final JwtService jwtService;

    @GetMapping("/dashboard")
    public DashboardResponse dashboard(@RequestHeader(value = "Authorization", required = false) String authorization) {
        requireAdmin(authorization);
        LocalDateTime onlineThreshold = LocalDateTime.now().minusMinutes(2);
        LocalDateTime monthStart = LocalDateTime.now().minusDays(30);

        List<Tienda> stores = tiendaRepository.findAll();
        List<Producto> products = productoRepository.findAll();
        List<Pedido> orders = pedidoRepository.findAll();
        Map<String, Set<String>> productsByStore = products.stream()
            .filter(product -> product.getTiendaId() != null)
            .collect(Collectors.groupingBy(Producto::getTiendaId,
                Collectors.mapping(Producto::getId, Collectors.toSet())));
        Map<String, String> storeByProduct = products.stream()
            .filter(product -> product.getTiendaId() != null)
            .collect(Collectors.toMap(Producto::getId, Producto::getTiendaId, (first, ignored) -> first));
        Map<String, BigDecimal> salesByStore = new HashMap<>();
        Map<String, Long> ordersByStore = new HashMap<>();

        for (Pedido order : orders) {
            if (order.getFechaCreacion() == null || order.getFechaCreacion().isBefore(monthStart)
                    || order.getEstado() == PedidoEstado.CANCELADO || order.getDetalles() == null) continue;
            Map<String, BigDecimal> orderSalesByStore = new HashMap<>();
            order.getDetalles().forEach(line -> {
                String storeId = storeByProduct.get(line.getProductoId());
                if (storeId != null) {
                    BigDecimal subtotal = line.getSubtotal() == null ? BigDecimal.ZERO : line.getSubtotal();
                    orderSalesByStore.merge(storeId, subtotal, BigDecimal::add);
                }
            });
            orderSalesByStore.forEach((storeId, sales) -> {
                salesByStore.merge(storeId, sales, BigDecimal::add);
                ordersByStore.merge(storeId, 1L, Long::sum);
            });
        }

        List<StoreSummary> storeSummaries = stores.stream().map(store -> new StoreSummary(
                store.getId(), store.getNombre(), store.getSlug(), Boolean.TRUE.equals(store.getActivo()),
                !Boolean.FALSE.equals(store.getAceptaPedidos()),
                store.getUltimaConexion() != null && store.getUltimaConexion().isAfter(onlineThreshold),
                store.getUltimaConexion(), productsByStore.getOrDefault(store.getId(), Set.of()).size(),
                ordersByStore.getOrDefault(store.getId(), 0L), salesByStore.getOrDefault(store.getId(), BigDecimal.ZERO)
        )).toList();

        List<UserSummary> users = usuarioRepository.findAll().stream()
                .map(user -> new UserSummary(user.getId(), user.getNombre(), user.getEmail(),
                    user.getRole().name(), user.getTiendaId(), !Boolean.FALSE.equals(user.getActivo())))
                .toList();
        long onlineStores = storeSummaries.stream().filter(StoreSummary::online).count();
        BigDecimal sales30d = salesByStore.values().stream().reduce(BigDecimal.ZERO, BigDecimal::add);

        return new DashboardResponse(storeSummaries, users,
                new DashboardStats(stores.size(), onlineStores, users.size(), orders.size(), sales30d));
    }

        @PatchMapping("/users/{userId}/status")
        public UserSummary updateUserStatus(
            @PathVariable String userId,
            @Valid @RequestBody UserStatusUpdate update,
            @RequestHeader(value = "Authorization", required = false) String authorization
        ) {
        String adminEmail = requireAdmin(authorization);
        Usuario user = usuarioRepository.findById(userId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Usuario no encontrado."));
        if (user.getEmail().equalsIgnoreCase(adminEmail)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "No puedes cambiar el estado de tu propia cuenta.");
        }
        user.setActivo(update.active());
        usuarioRepository.save(user);
        return new UserSummary(user.getId(), user.getNombre(), user.getEmail(), user.getRole().name(),
            user.getTiendaId(), update.active());
        }

        private String requireAdmin(String authorization) {
        if (authorization == null || !authorization.startsWith("Bearer ")) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Se requiere una sesión de administrador.");
        }
        String token = authorization.substring(7);
        try {
            if (!jwtService.isTokenValid(token)) {
                throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "La sesión expiró.");
            }
            if (!Role.ADMIN.name().equals(jwtService.extractRole(token))) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "El panel requiere una cuenta de administrador.");
            }
            return jwtService.extractEmail(token);
        } catch (ResponseStatusException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "La sesión no es válida.");
        }
    }

    public record DashboardResponse(List<StoreSummary> stores, List<UserSummary> users, DashboardStats stats) { }
    public record DashboardStats(int storeCount, long onlineCount, int userCount, int orderCount, BigDecimal sales30d) { }
    public record StoreSummary(String id, String name, String slug, boolean active, boolean acceptingOrders,
                               boolean online, LocalDateTime lastSeen, int productCount, long orders30d,
                               BigDecimal sales30d) { }
    public record UserSummary(String id, String name, String email, String role, String tiendaId, boolean active) { }
    public record UserStatusUpdate(@NotNull Boolean active) { }
}
