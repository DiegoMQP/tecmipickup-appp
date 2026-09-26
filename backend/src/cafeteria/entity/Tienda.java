package cafeteria.entity;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.LocalDateTime;

@Document(collection = "tiendas")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Tienda {

    @Id
    private String id;

    private String nombre;

    private String slug;

    private String descripcion;

    @Builder.Default
    private Boolean activo = true;

    @Builder.Default
    private Boolean aceptaPedidos = true;

    private LocalDateTime ultimaConexion;
}