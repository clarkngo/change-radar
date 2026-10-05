package dev.clarkngo.changeradar.ingest.deploys;

import java.time.Instant;
import java.util.Map;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import dev.clarkngo.changeradar.catalog.ServiceCatalog;
import dev.clarkngo.changeradar.change.ChangeEvent;
import dev.clarkngo.changeradar.change.ChangeSourceType;
import dev.clarkngo.changeradar.change.ChangeType;
import dev.clarkngo.changeradar.change.Risk;
import dev.clarkngo.changeradar.ingest.SourceRecord;

/** A GitHub-style deployment event. Times are ISO-8601; the repository is "org/service". */
@JsonIgnoreProperties(ignoreUnknown = true)
public record DeployEvent(
		long id,
		String repository,
		String environment,
		String sha,
		String creator,
		@JsonProperty("created_at") String createdAt,
		String description,
		Map<String, String> payload) implements SourceRecord {

	@Override
	public ChangeEvent normalize(ServiceCatalog catalog) {
		if (!"production".equalsIgnoreCase(environment)) {
			return null;
		}
		String service = repository.substring(repository.indexOf('/') + 1);
		Map<String, String> p = payload == null ? Map.of() : payload;
		String shortSha = sha.length() > 7 ? sha.substring(0, 7) : sha;
		return new ChangeEvent(
				ChangeEvent.idFor(ChangeSourceType.DEPLOYS, Long.toString(id)),
				ChangeSourceType.DEPLOYS,
				Long.toString(id),
				ChangeType.DEPLOY,
				service,
				catalog.teamOf(service),
				"Deploy " + shortSha + ": " + description,
				creator,
				p.get("ticket"),
				riskFor(p.get("risk")),
				// A deploy can always be rolled back to the previous build, unless it's marked irreversible (e.g. a migration).
				!"true".equalsIgnoreCase(p.get("irreversible")),
				Instant.parse(createdAt),
				null);
	}

	static Risk riskFor(String risk) {
		if (risk == null) {
			return Risk.MEDIUM;
		}
		try {
			return Risk.valueOf(risk.toUpperCase());
		}
		catch (IllegalArgumentException e) {
			return Risk.MEDIUM;
		}
	}

}
