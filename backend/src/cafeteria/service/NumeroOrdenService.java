package cafeteria.service;

import org.bson.Document;
import org.springframework.data.mongodb.core.FindAndModifyOptions;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

@Service
public class NumeroOrdenService {

    private static final DateTimeFormatter DAY_KEY = DateTimeFormatter.BASIC_ISO_DATE;
    private final MongoTemplate mongoTemplate;

    public NumeroOrdenService(MongoTemplate mongoTemplate) {
        this.mongoTemplate = mongoTemplate;
    }

    public int siguiente(LocalDateTime fecha) {
        String sequenceId = "ordenes-" + fecha.toLocalDate().format(DAY_KEY);
        Document sequence = mongoTemplate.findAndModify(
                Query.query(Criteria.where("_id").is(sequenceId)),
                new Update().inc("valor", 1),
                FindAndModifyOptions.options().upsert(true).returnNew(true),
                Document.class,
                "secuencias_pedidos");
        if (sequence == null) {
            throw new IllegalStateException("No se pudo asignar el número del pedido.");
        }
        return sequence.getInteger("valor");
    }
}
