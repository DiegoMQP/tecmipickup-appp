package cafeteria.repository;

import cafeteria.entity.Tienda;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.List;

public interface TiendaRepository extends MongoRepository<Tienda, String> {
    List<Tienda> findByActivoTrueOrderByNombreAsc();
    java.util.Optional<Tienda> findBySlugIgnoreCase(String slug);
}