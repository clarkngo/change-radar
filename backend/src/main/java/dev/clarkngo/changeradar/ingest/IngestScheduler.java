package dev.clarkngo.changeradar.ingest;

import org.springframework.boot.autoconfigure.condition.ConditionalOnBooleanProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnBooleanProperty(name = "changeradar.ingest.scheduled", matchIfMissing = true)
class IngestScheduler {

	private final IngestService ingestService;

	IngestScheduler(IngestService ingestService) {
		this.ingestService = ingestService;
	}

	@Scheduled(initialDelayString = "PT3S", fixedDelayString = "${changeradar.ingest.interval:60s}")
	void ingest() {
		ingestService.runAll();
	}

}
