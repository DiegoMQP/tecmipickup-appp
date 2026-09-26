package cafeteria.config;

import cafeteria.entity.CategoriaProducto;
import cafeteria.entity.HorarioCafeteria;
import cafeteria.entity.Producto;
import cafeteria.entity.Role;
import cafeteria.entity.Tienda;
import cafeteria.entity.Usuario;
import com.fasterxml.jackson.databind.ObjectMapper;
import cafeteria.repository.CategoriaProductoRepository;
import cafeteria.repository.HorarioCafeteriaRepository;
import cafeteria.repository.ProductoRepository;
import cafeteria.repository.TiendaRepository;
import cafeteria.repository.UsuarioRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.core.io.ClassPathResource;

import java.math.BigDecimal;
import java.io.IOException;
import java.time.DayOfWeek;
import java.time.LocalTime;
import java.util.HashMap;
import java.util.Map;

@Slf4j
@Component
@RequiredArgsConstructor
public class CatalogoSeeder implements CommandLineRunner {

    private final CategoriaProductoRepository categoriaProductoRepository;
    private final ProductoRepository productoRepository;
    private final HorarioCafeteriaRepository horarioCafeteriaRepository;
    private final TiendaRepository tiendaRepository;
    private final UsuarioRepository usuarioRepository;
    private final PasswordEncoder passwordEncoder;
    private final ObjectMapper objectMapper;

    @Value("${app.admin.email:}")
    private String adminEmail;

    @Value("${app.admin.password:}")
    private String adminPassword;

    @Value("${TECMIPICKUP_RESTAURANT_NAME:Cuenta de restaurante}")
    private String restaurantName;

    @Value("${TECMIPICKUP_RESTAURANT_EMAIL:}")
    private String restaurantEmail;

    @Value("${TECMIPICKUP_RESTAURANT_PASSWORD:}")
    private String restaurantPassword;

    @Value("${TECMIPICKUP_RESTAURANT_MATRICULA:}")
    private String restaurantMatricula;

    @Value("${TECMIPICKUP_RESTAURANT_STORE_ID:}")
    private String restaurantStoreId;

    @Override
    public void run(String... args) {
        for (DayOfWeek dia : DayOfWeek.values()) {
            HorarioCafeteria horario = horarioCafeteriaRepository.findByDiaSemana(dia.name())
                    .orElseGet(() -> HorarioCafeteria.builder().diaSemana(dia.name()).build());
            horario.setHoraApertura(LocalTime.MIDNIGHT);
            horario.setHoraCierre(LocalTime.of(23, 59));
            horarioCafeteriaRepository.save(horario);
        }
        log.info("Horarios de cafetería configurados 24/7 para la demostración.");

        Tienda tiendaBuho = ensureTienda("tienda-buho", "Vithia-Cafetería", "vathi-cafeteria",
            "Paninis, lonches, hamburguesas, sándwiches y refrescos.");
        Tienda tiendaCentral = ensureTienda("tienda-central", "Jorgillos", "jorgillo",
            "Tortas ahogadas, tacos dorados, botanas y refrescos.");
        Tienda tiendaChilaquileria = ensureTienda("tienda-chilaquileria", "Chilaquilería", "chilaquileria",
            "Chilaquiles, tortas, bebidas y energizantes.");
        tiendaRepository.findById("tienda-green").ifPresent(tienda -> {
            tienda.setActivo(false);
            tienda.setAceptaPedidos(false);
            tiendaRepository.save(tienda);
        });

        if (restaurantEmail != null && !restaurantEmail.isBlank()
            && restaurantPassword != null && !restaurantPassword.isBlank()
            && restaurantMatricula != null && !restaurantMatricula.isBlank()
            && restaurantStoreId != null && !restaurantStoreId.isBlank()
            && !usuarioRepository.existsByEmail(restaurantEmail.trim())) {
            usuarioRepository.save(Usuario.builder()
            .nombre(restaurantName)
            .email(restaurantEmail.trim())
            .password(passwordEncoder.encode(restaurantPassword))
                .role(Role.RESTAURANT)
            .matricula(restaurantMatricula.trim())
            .tiendaId(restaurantStoreId.trim())
                .build());
        }

            if (adminEmail != null && !adminEmail.isBlank() && adminPassword != null && !adminPassword.isBlank()
                && !usuarioRepository.existsByEmail(adminEmail)) {
                usuarioRepository.save(Usuario.builder()
                .nombre("Desarrollador")
                .email(adminEmail.trim())
                .password(passwordEncoder.encode(adminPassword))
                .role(Role.ADMIN)
                .build());
            }

        if (categoriaProductoRepository.count() == 0) {
            CategoriaProducto bebidas = categoriaProductoRepository.save(
                CategoriaProducto.builder().nombre("Bebidas").build());
            CategoriaProducto comida = categoriaProductoRepository.save(
                CategoriaProducto.builder().nombre("Comida").build());

            productoRepository.save(Producto.builder()
                .nombre("Café americano")
                .descripcion("Café de grano")
                .precio(new BigDecimal("35.00"))
                .stock(40)
                .activo(true)
                .categoriaId(bebidas.getId())
                .categoriaNombre(bebidas.getNombre())
                .tiendaId(tiendaCentral.getId())
                .build());
            productoRepository.save(Producto.builder()
                .nombre("Taco sencillo")
                .descripcion("Taco de guisado")
                .precio(new BigDecimal("50.00"))
                .stock(25)
                .activo(true)
                .categoriaId(comida.getId())
                .categoriaNombre(comida.getNombre())
                .tiendaId(tiendaBuho.getId())
                .build());
            log.info("Catálogo de ejemplo inicializado.");
        }

        seedCatalogoExtendido();
        desactivarProductosDeEjemplo();
        productoRepository.findByTiendaIdOrderByNombreAsc("tienda-green").stream()
            .filter(producto -> Boolean.TRUE.equals(producto.getActivo()))
            .forEach(producto -> {
                producto.setActivo(false);
                productoRepository.save(producto);
            });

        productoRepository.findAll().stream()
            .filter(producto -> producto.getTiendaId() == null
                || producto.getTiendaId().isBlank()
                || (producto.getNombre() != null
                        && (producto.getNombre().toLowerCase().contains("cafe")
                        || producto.getNombre().toLowerCase().contains("café"))))
            .forEach(producto -> {
                    String nombre = producto.getNombre() == null ? "" : producto.getNombre().toLowerCase();
                    producto.setTiendaId(nombre.contains("café") || nombre.contains("cafe")
                            ? tiendaCentral.getId() : tiendaBuho.getId());
                productoRepository.save(producto);
            });
        }

        private Tienda ensureTienda(String id, String nombre, String slug, String descripcion) {
            Tienda tienda = tiendaRepository.findById(id).orElseGet(() -> Tienda.builder().id(id).build());
            tienda.setNombre(nombre);
            tienda.setSlug(slug);
            tienda.setDescripcion(descripcion);
            tienda.setActivo(true);
            if (tienda.getAceptaPedidos() == null) {
                tienda.setAceptaPedidos(true);
            }
            return tiendaRepository.save(tienda);
    }

    private void seedCatalogoExtendido() {
        try {
            ProductoSemilla[] productos = objectMapper.readValue(
                    new ClassPathResource("catalogo-extendido.json").getInputStream(), ProductoSemilla[].class);
            Map<String, CategoriaProducto> categorias = new HashMap<>();
            for (ProductoSemilla semilla : productos) {
                CategoriaProducto categoria = categorias.computeIfAbsent(semilla.category(), nombre ->
                        categoriaProductoRepository.findByNombre(nombre)
                                .orElseGet(() -> categoriaProductoRepository.save(
                                        CategoriaProducto.builder().nombre(nombre).build())));
                Producto producto = productoRepository.findById(semilla.id())
                        .orElseGet(() -> Producto.builder().id(semilla.id()).stock(25).activo(true).build());
                producto.setNombre(semilla.name());
                producto.setDescripcion(semilla.description());
                producto.setImageUrl(semilla.imageUrl());
                producto.setPrecio(BigDecimal.valueOf(semilla.price()));
                producto.setCategoriaId(categoria.getId());
                producto.setCategoriaNombre(categoria.getNombre());
                producto.setTiendaId(semilla.storeId());
                if (producto.getStock() == null) producto.setStock(25);
                if (producto.getActivo() == null) producto.setActivo(true);
                productoRepository.save(producto);
            }
            log.info("Catálogo extendido de {} productos sincronizado.", productos.length);
        } catch (IOException exception) {
            throw new IllegalStateException("No se pudo leer catalogo-extendido.json.", exception);
        }
    }

    private void desactivarProductosDeEjemplo() {
        productoRepository.findAll().stream()
                .filter(producto -> "Café americano".equals(producto.getNombre())
                        || "Taco sencillo".equals(producto.getNombre()))
                .filter(producto -> Boolean.TRUE.equals(producto.getActivo()))
                .forEach(producto -> {
                    producto.setActivo(false);
                    productoRepository.save(producto);
                });
    }

    private record ProductoSemilla(String id, String storeId, String name, String description,
                                   String category, int price, String imageUrl) { }
}
