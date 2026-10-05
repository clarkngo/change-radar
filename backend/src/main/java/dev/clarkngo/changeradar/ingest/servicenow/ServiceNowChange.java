package dev.clarkngo.changeradar.ingest.servicenow;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.Locale;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import dev.clarkngo.changeradar.catalog.ServiceCatalog;
import dev.clarkngo.changeradar.change.ChangeEvent;
import dev.clarkngo.changeradar.change.ChangeSourceType;
import dev.clarkngo.changeradar.change.ChangeType;
import dev.clarkngo.changeradar.change.Risk;
import dev.clarkngo.changeradar.ingest.SourceRecord;

/** A row from ServiceNow's change_request table API. Times are UTC "yyyy-MM-dd HH:mm:ss". */
@JsonIgnoreProperties(ignoreUnknown = true)
public record ServiceNowChange(
		@JsonProperty("sys_id") String sysId,
		String number,
		@JsonProperty("short_description") String shortDescription,
		@JsonProperty("cmdb_ci") String configurationItem,
		@JsonProperty("assigned_to") String assignedTo,
		String category,
		String risk,
		@JsonProperty("backout_plan") String backoutPlan,
		@JsonProperty("start_date") String startDate) implements SourceRecord {

	static final DateTimeFormatter TIME_FORMAT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

	@Override
	public ChangeEvent normalize(ServiceCatalog catalog) {
		return new ChangeEvent(
				ChangeEvent.idFor(ChangeSourceType.SERVICENOW, sysId),
				ChangeSourceType.SERVICENOW,
				sysId,
				typeFor(category),
				configurationItem,
				catalog.teamOf(configurationItem),
				number + ": " + shortDescription,
				assignedTo,
				number,
				riskFor(risk),
				backoutPlan != null && !backoutPlan.isBlank(),
				LocalDateTime.parse(startDate, TIME_FORMAT).toInstant(ZoneOffset.UTC),
				null);
	}

	static ChangeType typeFor(String category) {
		if (category == null) {
			return ChangeType.CONFIG;
		}
		return switch (category.toLowerCase(Locale.ROOT)) {
			case "network", "hardware", "infrastructure", "database" -> ChangeType.INFRA;
			default -> ChangeType.CONFIG;
		};
	}

	static Risk riskFor(String risk) {
		if (risk == null) {
			return Risk.MEDIUM;
		}
		return switch (risk.toLowerCase(Locale.ROOT)) {
			case "high", "very high" -> Risk.HIGH;
			case "low" -> Risk.LOW;
			default -> Risk.MEDIUM;
		};
	}

}
