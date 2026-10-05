package dev.clarkngo.changeradar.change;

import java.util.Collection;
import java.util.List;

import co.elastic.clients.elasticsearch._types.FieldValue;
import co.elastic.clients.elasticsearch._types.query_dsl.BoolQuery;
import co.elastic.clients.elasticsearch._types.query_dsl.Query;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.elasticsearch.client.elc.NativeQuery;
import org.springframework.data.elasticsearch.core.ElasticsearchOperations;
import org.springframework.data.elasticsearch.core.SearchHit;
import org.springframework.data.elasticsearch.core.SearchHits;
import org.springframework.stereotype.Service;

@Service
public class ChangeSearchService {

	/** Upper bound for unpaged reads (correlation windows, compliance reports). */
	static final int MAX_UNPAGED = 5_000;

	private final ElasticsearchOperations operations;

	public ChangeSearchService(ElasticsearchOperations operations) {
		this.operations = operations;
	}

	/** Newest first, paged. */
	public Page<ChangeEvent> search(ChangeQuery query, Pageable pageable) {
		NativeQuery nativeQuery = NativeQuery.builder()
			.withQuery(toEsQuery(query))
			.withSort(Sort.by(Sort.Direction.DESC, "startedAt"))
			.withPageable(pageable)
			.withTrackTotalHits(true)
			.build();
		SearchHits<ChangeEvent> hits = operations.search(nativeQuery, ChangeEvent.class);
		return new PageImpl<>(contents(hits), pageable, hits.getTotalHits());
	}

	/** Everything matching the query, up to {@link #MAX_UNPAGED}. */
	public List<ChangeEvent> findAll(ChangeQuery query) {
		return search(query, PageRequest.of(0, MAX_UNPAGED)).getContent();
	}

	private static List<ChangeEvent> contents(SearchHits<ChangeEvent> hits) {
		return hits.getSearchHits().stream().map(SearchHit::getContent).toList();
	}

	static Query toEsQuery(ChangeQuery q) {
		BoolQuery.Builder bool = new BoolQuery.Builder();
		if (q.text() != null && !q.text().isBlank()) {
			bool.must(m -> m.simpleQueryString(s -> s
				.query(q.text())
				.fields("summary", "service", "author", "ticket", "team")
				.defaultOperator(co.elastic.clients.elasticsearch._types.query_dsl.Operator.And)));
		}
		termsFilter(bool, "service", q.services());
		termsFilter(bool, "team", q.teams());
		if (q.types() != null && !q.types().isEmpty()) {
			termsFilter(bool, "type", q.types().stream().map(Enum::name).toList());
		}
		if (q.from() != null || q.to() != null) {
			bool.filter(f -> f.range(r -> r.date(d -> {
				d.field("startedAt");
				if (q.from() != null) {
					d.gte(q.from().toString());
				}
				if (q.to() != null) {
					d.lte(q.to().toString());
				}
				return d;
			})));
		}
		if (q.compliant() != null) {
			Query hasMissing = Query.of(e -> e.exists(x -> x.field("missingMetadata")));
			if (q.compliant()) {
				bool.mustNot(hasMissing);
			}
			else {
				bool.filter(hasMissing);
			}
		}
		return Query.of(b -> b.bool(bool.build()));
	}

	private static void termsFilter(BoolQuery.Builder bool, String field, Collection<String> values) {
		if (values == null || values.isEmpty()) {
			return;
		}
		List<FieldValue> fieldValues = values.stream().map(FieldValue::of).toList();
		bool.filter(f -> f.terms(t -> t.field(field).terms(v -> v.value(fieldValues))));
	}

}
