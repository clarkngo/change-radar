package dev.clarkngo.changeradar.change;

import java.time.Instant;
import java.util.List;

import org.springframework.data.annotation.Id;
import org.springframework.data.elasticsearch.annotations.Document;
import org.springframework.data.elasticsearch.annotations.Field;
import org.springframework.data.elasticsearch.annotations.FieldType;

/**
 * A change from any source, normalized to one shape. The id is {@code source:externalId}, so
 * re-ingesting the same record overwrites it instead of duplicating it.
 */
@Document(indexName = "#{@environment.getProperty('changeradar.index-name', 'changes')}")
public record ChangeEvent(
		@Id String id,
		@Field(type = FieldType.Keyword) ChangeSourceType source,
		@Field(type = FieldType.Keyword) String externalId,
		@Field(type = FieldType.Keyword) ChangeType type,
		@Field(type = FieldType.Keyword) String service,
		@Field(type = FieldType.Keyword) String team,
		@Field(type = FieldType.Text) String summary,
		@Field(type = FieldType.Keyword) String author,
		@Field(type = FieldType.Keyword) String ticket,
		@Field(type = FieldType.Keyword) Risk risk,
		@Field(type = FieldType.Boolean) boolean hasRollbackPlan,
		@Field(type = FieldType.Date) Instant startedAt,
		@Field(type = FieldType.Keyword) List<String> missingMetadata) {

	public ChangeEvent {
		missingMetadata = missingMetadata == null ? List.of() : List.copyOf(missingMetadata);
	}

	public static String idFor(ChangeSourceType source, String externalId) {
		return source.name().toLowerCase() + ":" + externalId;
	}

	public boolean compliant() {
		return missingMetadata.isEmpty();
	}

	public ChangeEvent withMissingMetadata(List<String> missing) {
		return new ChangeEvent(id, source, externalId, type, service, team, summary, author, ticket, risk,
				hasRollbackPlan, startedAt, missing);
	}

}
