package cafeteria;

import cafeteria.dto.DetallePedidoRequest;
import cafeteria.dto.PedidoRequest;
import cafeteria.dto.PedidoResponse;
import cafeteria.entity.Pedido;
import cafeteria.entity.PedidoEstado;
import cafeteria.entity.Producto;
import cafeteria.entity.Role;
import cafeteria.entity.Tienda;
import cafeteria.entity.Usuario;
import cafeteria.exception.ApiException;
import cafeteria.kitchen.CocinaCola;
import cafeteria.repository.PedidoRepository;
import cafeteria.repository.ProductoRepository;
import cafeteria.repository.TiendaRepository;
import cafeteria.repository.UsuarioRepository;
import cafeteria.service.HorarioService;
import cafeteria.service.NumeroOrdenService;
import cafeteria.service.PedidoService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.junit.jupiter.api.Assumptions.assumeTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PedidoServiceTest {

    @Mock
    private PedidoRepository pedidoRepository;
    @Mock
    private UsuarioRepository usuarioRepository;
    @Mock
    private ProductoRepository productoRepository;
    @Mock
    private TiendaRepository tiendaRepository;
    @Mock
    private HorarioService horarioService;
    @Mock
    private CocinaCola cocinaCola;
    @Mock
    private NumeroOrdenService numeroOrdenService;

    @InjectMocks
    private PedidoService pedidoService;

    private Usuario usuario;
    private Producto cafe;

    @BeforeEach
    void setup() {
        usuario = Usuario.builder()
                .id("u1")
                .nombre("Ana")
                .email("ana@tec.mx")
                .password("hash")
                .role(Role.CLIENT)
                .build();
        cafe = Producto.builder()
                .id("p1")
                .nombre("Cafe")
                .descripcion("Americano")
                .precio(new BigDecimal("35.00"))
                .stock(10)
                .activo(true)
                .categoriaId("c1")
                .categoriaNombre("Bebidas")
                .build();
    }

    @Test
    void shouldCreatePedidoWithPickupOverFifteenMinutesAway() {
        when(usuarioRepository.findById("u1")).thenReturn(Optional.of(usuario));
        when(productoRepository.findById("p1")).thenReturn(Optional.of(cafe));
        when(numeroOrdenService.siguiente(any())).thenReturn(1);
        when(horarioService.porDia(any())).thenReturn(Optional.empty());
        when(pedidoRepository.save(any(Pedido.class))).thenAnswer(invocation -> {
            Pedido pedido = invocation.getArgument(0);
            pedido.setId("ped1");
            return pedido;
        });

        LocalDateTime validPickup = LocalDateTime.now(ZoneId.of("America/Mexico_City")).plusMinutes(30).withSecond(0).withNano(0);
        PedidoRequest request = pedidoRequest(validPickup, "p1", 2);

        PedidoResponse pedido = pedidoService.crearPedido("u1", request);

        assertEquals(PedidoEstado.PENDIENTE, pedido.getEstado());
        assertEquals(1, pedido.getNumeroOrden());
        assertEquals(1, pedido.getDetalles().size());
        assertEquals(new BigDecimal("70.00"), pedido.getTotal());
        verify(cocinaCola).registrar(any(Pedido.class));

        ArgumentCaptor<Producto> productoCaptor = ArgumentCaptor.forClass(Producto.class);
        verify(productoRepository).save(productoCaptor.capture());
        assertEquals(8, productoCaptor.getValue().getStock());
    }

    @Test
    void shouldAcceptPickupAtLeastFifteenMinutesAheadWhenRoundedToWholeMinute() {
        when(usuarioRepository.findById("u1")).thenReturn(Optional.of(usuario));
        when(productoRepository.findById("p1")).thenReturn(Optional.of(cafe));
        when(numeroOrdenService.siguiente(any())).thenReturn(1);
        when(horarioService.porDia(any())).thenReturn(Optional.empty());
        when(pedidoRepository.save(any(Pedido.class))).thenAnswer(invocation -> {
            Pedido pedido = invocation.getArgument(0);
            pedido.setId("ped15");
            return pedido;
        });

        LocalDateTime now = LocalDateTime.now(ZoneId.of("America/Mexico_City"));
        LocalDateTime pickup = now.plusMinutes(15).withSecond(0).withNano(0);
        if (pickup.isBefore(now.plusMinutes(15))) {
            pickup = pickup.plusMinutes(1);
        }
        assumeTrue(pickup.toLocalDate().equals(now.toLocalDate()));

        PedidoResponse pedido = pedidoService.crearPedido("u1", pedidoRequest(pickup, "p1", 1));

        assertEquals(PedidoEstado.PENDIENTE, pedido.getEstado());
    }

    @Test
    void shouldRejectPedidoWithLessThanFifteenMinutesAdvance() {
        when(usuarioRepository.findById("u1")).thenReturn(Optional.of(usuario));

        PedidoRequest request = pedidoRequest(LocalDateTime.now().plusMinutes(5), "p1", 1);

        ApiException exception = assertThrows(ApiException.class, () -> pedidoService.crearPedido("u1", request));
        assertTrue(exception.getMessage().contains("15 minutos"));
        assertEquals(HttpStatus.BAD_REQUEST, exception.getStatus());
    }

    @Test
    void shouldRejectPickupOnTheFollowingDay() {
        when(usuarioRepository.findById("u1")).thenReturn(Optional.of(usuario));
        LocalDateTime tomorrow = LocalDateTime.now(ZoneId.of("America/Mexico_City")).plusDays(1).withHour(12);

        ApiException exception = assertThrows(ApiException.class,
                () -> pedidoService.crearPedido("u1", pedidoRequest(tomorrow, "p1", 1)));

        assertTrue(exception.getMessage().contains("día de hoy"));
    }

    @Test
    void shouldRejectScheduledPickupOutsideQuarterHourIntervals() {
        when(usuarioRepository.findById("u1")).thenReturn(Optional.of(usuario));
        LocalDateTime pickup = LocalDateTime.now(ZoneId.of("America/Mexico_City"))
                .plusMinutes(30).withSecond(0).withNano(0);
        pickup = pickup.withMinute((pickup.getMinute() / 15) * 15 + 1);
        PedidoRequest request = pedidoRequest(pickup, "p1", 1);
        request.setProgramado(true);

        ApiException exception = assertThrows(ApiException.class, () -> pedidoService.crearPedido("u1", request));

        assertTrue(exception.getMessage().contains("intervalos de 15 minutos"));
    }

    @Test
    void shouldRejectProductsFromDifferentStoresInOneOrder() {
        cafe.setTiendaId("tienda-a");
        Producto otraBebida = Producto.builder()
                .id("p2")
                .nombre("Té")
                .precio(new BigDecimal("20.00"))
                .stock(10)
                .activo(true)
                .tiendaId("tienda-b")
                .build();
        when(usuarioRepository.findById("u1")).thenReturn(Optional.of(usuario));
        when(productoRepository.findById("p1")).thenReturn(Optional.of(cafe));
        when(productoRepository.findById("p2")).thenReturn(Optional.of(otraBebida));
        LocalDateTime pickup = LocalDateTime.now(ZoneId.of("America/Mexico_City")).plusMinutes(30);
        PedidoRequest request = pedidoRequest(pickup, "p1", 1);
        DetallePedidoRequest secondLine = new DetallePedidoRequest();
        secondLine.setProductoId("p2");
        secondLine.setCantidad(1);
        request.setDetalles(List.of(request.getDetalles().get(0), secondLine));

        ApiException exception = assertThrows(ApiException.class, () -> pedidoService.crearPedido("u1", request));

        assertEquals(HttpStatus.CONFLICT, exception.getStatus());
        assertTrue(exception.getMessage().contains("una sola tienda"));
    }

    @Test
    void shouldRejectPedidoWhenRestaurantIsPaused() {
        cafe.setTiendaId("tienda-central");
        when(usuarioRepository.findById("u1")).thenReturn(Optional.of(usuario));
        when(productoRepository.findById("p1")).thenReturn(Optional.of(cafe));
        when(tiendaRepository.findById("tienda-central")).thenReturn(Optional.of(
                Tienda.builder().id("tienda-central").aceptaPedidos(false).build()));
        when(horarioService.porDia(any())).thenReturn(Optional.empty());

        LocalDateTime validPickup = LocalDateTime.now(ZoneId.of("America/Mexico_City")).plusMinutes(30).withSecond(0).withNano(0);
        ApiException exception = assertThrows(ApiException.class,
                () -> pedidoService.crearPedido("u1", pedidoRequest(validPickup, "p1", 1)));

        assertTrue(exception.getMessage().contains("no está aceptando pedidos"));
    }

    @Test
    void shouldRejectCashBeforeTenPreviousCardOrders() {
        when(usuarioRepository.findById("u1")).thenReturn(Optional.of(usuario));
        when(pedidoRepository.countByUsuarioIdAndMetodoPagoAndEstadoNot("u1", "TARJETA", PedidoEstado.CANCELADO))
                .thenReturn(9L);
        PedidoRequest request = pedidoRequest(LocalDateTime.now(ZoneId.of("America/Mexico_City")).plusMinutes(30), "p1", 1);
        request.setMetodoPago("EFECTIVO");

        ApiException exception = assertThrows(ApiException.class, () -> pedidoService.crearPedido("u1", request));

        assertEquals(HttpStatus.CONFLICT, exception.getStatus());
        assertTrue(exception.getMessage().contains("10 pedidos previos"));
    }

    @Test
    void shouldRejectCancellationOfScheduledOrderWithinThirtyMinutes() {
        Pedido pedido = Pedido.builder()
                .id("ped2")
                .usuarioId("u1")
                .estado(PedidoEstado.PENDIENTE)
                .programado(true)
                .fechaEntregaSolicitada(LocalDateTime.now(ZoneId.of("America/Mexico_City")).plusMinutes(30).minusSeconds(1))
                .detalles(List.of())
                .build();
        when(pedidoRepository.findById("ped2")).thenReturn(Optional.of(pedido));

        ApiException exception = assertThrows(ApiException.class, () -> pedidoService.cancelarPedido("ped2"));

        assertEquals(HttpStatus.CONFLICT, exception.getStatus());
        assertTrue(exception.getMessage().contains("30 minutos"));
    }

    @Test
    void shouldRestoreStockOnCancel() {
        Pedido pedido = Pedido.builder()
                .id("ped1")
                .usuarioId("u1")
                .estado(PedidoEstado.PENDIENTE)
                .total(new BigDecimal("35.00"))
                .detalles(List.of(cafeteria.entity.DetallePedido.builder()
                        .productoId("p1")
                        .productoNombre("Cafe")
                        .cantidad(2)
                        .precioUnitario(new BigDecimal("35.00"))
                        .subtotal(new BigDecimal("70.00"))
                        .build()))
                .build();
        when(pedidoRepository.findById("ped1")).thenReturn(Optional.of(pedido));
        when(productoRepository.findById("p1")).thenReturn(Optional.of(cafe));
        when(pedidoRepository.save(any(Pedido.class))).thenAnswer(invocation -> invocation.getArgument(0));

        PedidoResponse cancelled = pedidoService.cancelarPedido("ped1");

        assertEquals(PedidoEstado.CANCELADO, cancelled.getEstado());
        assertEquals(12, cafe.getStock());
    }

    private PedidoRequest pedidoRequest(LocalDateTime entrega, String productoId, int cantidad) {
        PedidoRequest request = new PedidoRequest();
        request.setFechaEntregaSolicitada(entrega);
        DetallePedidoRequest detalle = new DetallePedidoRequest();
        detalle.setProductoId(productoId);
        detalle.setCantidad(cantidad);
        request.setDetalles(List.of(detalle));
        return request;
    }
}
