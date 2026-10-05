package dev.clarkngo.changeradar.web;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import dev.clarkngo.changeradar.correlate.CorrelationResult;
import dev.clarkngo.changeradar.correlate.CorrelationService;
import dev.clarkngo.changeradar.correlate.Suspect;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/**
 * Grafana alerting contact point. Point a webhook at {@code /api/webhooks/grafana} and every firing alert
 * with a {@code service} label is correlated with recent changes the moment it fires.
 */
@RestController
class GrafanaWebhookController {

	private static final Logger log = LoggerFactory.getLogger(GrafanaWebhookController.class);

	@JsonIgnoreProperties(ignoreUnknown = true)
	record GrafanaPayload(String status, List<GrafanaAlert> alerts) {
	}

	@JsonIgnoreProperties(ignoreUnknown = true)
	record GrafanaAlert(String status, Map<String, String> labels, Instant startsAt) {
	}

	record AlertCorrelation(String alertname, String service, String note, CorrelationResult result) {
	}

	private final CorrelationService correlation;

	GrafanaWebhookController(CorrelationService correlation) {
		this.correlation = correlation;
	}

	@PostMapping("/api/webhooks/grafana")
	List<AlertCorrelation> receive(@RequestBody GrafanaPayload payload) {
		if (payload.alerts() == null) {
			return List.of();
		}
		return payload.alerts().stream().filter(a -> "firing".equalsIgnoreCase(a.status())).map(this::handle).toList();
	}

	private AlertCorrelation handle(GrafanaAlert alert) {
		Map<String, String> labels = alert.labels() == null ? Map.of() : alert.labels();
		String alertname = labels.getOrDefault("alertname", "unnamed");
		String service = labels.get("service");
		if (service == null || service.isBlank()) {
			return new AlertCorrelation(alertname, null, "Alert has no 'service' label; cannot correlate", null);
		}
		Instant at = alert.startsAt() == null ? Instant.now() : alert.startsAt();
		CorrelationResult result = correlation.correlate(service, at, CorrelationService.DEFAULT_WINDOW_MINUTES);
		Suspect top = result.suspects().isEmpty() ? null : result.suspects().getFirst();
		log.info("Alert {} on {}: top suspect {}", alertname, service,
				top == null ? "none" : top.change().summary() + " (score " + top.score() + ")");
		return new AlertCorrelation(alertname, service, null, result);
	}

}
