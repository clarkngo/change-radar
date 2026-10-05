package dev.clarkngo.changeradar.ingest.flags;

import java.time.Instant;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import dev.clarkngo.changeradar.catalog.ServiceCatalog;
import dev.clarkngo.changeradar.change.ChangeEvent;
import dev.clarkngo.changeradar.change.ChangeSourceType;
import dev.clarkngo.changeradar.change.ChangeType;
import dev.clarkngo.changeradar.change.Risk;
import dev.clarkngo.changeradar.ingest.SourceRecord;

/** A feature-flag audit log entry. The timestamp is epoch milliseconds. */
@JsonIgnoreProperties(ignoreUnknown = true)
public record FlagAuditEntry(
		String id,
		String flagKey,
		String service,
		String action,
		String fromValue,
		String toValue,
		String actor,
		long timestamp,
		String ticket) implements SourceRecord {

	@Override
	public ChangeEvent normalize(ServiceCatalog catalog) {
		return new ChangeEvent(
				ChangeEvent.idFor(ChangeSourceType.FEATURE_FLAGS, id),
				ChangeSourceType.FEATURE_FLAGS,
				id,
				ChangeType.FEATURE_FLAG,
				service,
				catalog.teamOf(service),
				"Flag " + flagKey + " " + action.toLowerCase().replace('_', ' ') + " (" + fromValue + " → " + toValue + ")",
				actor,
				ticket,
				riskFor(action, toValue),
				true, // flipping a flag back is the rollback
				Instant.ofEpochMilli(timestamp),
				null);
	}

	/** Turning something on, or rolling out to at least half of traffic, is riskier than turning it off. */
	static Risk riskFor(String action, String toValue) {
		return switch (action) {
			case "DISABLED" -> Risk.LOW;
			case "ROLLOUT_CHANGED" -> percent(toValue) >= 50 ? Risk.HIGH : Risk.LOW;
			default -> Risk.MEDIUM;
		};
	}

	private static int percent(String value) {
		try {
			return Integer.parseInt(value.replace("%", "").trim());
		}
		catch (RuntimeException e) {
			return 0;
		}
	}

}
