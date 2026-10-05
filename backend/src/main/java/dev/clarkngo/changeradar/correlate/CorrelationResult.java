package dev.clarkngo.changeradar.correlate;

import java.time.Instant;
import java.util.List;

public record CorrelationResult(String alertService, Instant alertTime, int windowMinutes, int changesConsidered,
		long tookMs, List<Suspect> suspects) {
}
