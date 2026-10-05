package dev.clarkngo.changeradar.change;

import org.springframework.data.elasticsearch.repository.ElasticsearchRepository;

public interface ChangeEventRepository extends ElasticsearchRepository<ChangeEvent, String> {
}
