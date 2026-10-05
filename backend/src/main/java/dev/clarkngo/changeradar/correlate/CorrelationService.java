package dev.clarkngo.changeradar.correlate;

import java.time.Duration;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;

import dev.clarkngo.changeradar.catalog.ServiceCatalog;
import dev.clarkngo.changeradar.change.ChangeEvent;
import dev.clarkngo.changeradar.change.ChangeQuery;
import dev.clarkngo.changeradar.change.ChangeSearchService;
import org.springframework.stereotype.Service;

/** Answers "what changed right before this alert?" with a ranked list of suspects. */
@Service
public class CorrelationService {

	public static final int DEFAULT_WINDOW_MINUTES = 120;
	public static final int MAX_SUSPECTS = 10;

	private final ChangeSearchService search;
	private final ServiceCatalog catalog;

	public CorrelationService(ChangeSearchService search, ServiceCatalog catalog) {
		this.search = search;
		this.catalog = catalog;
	}

	public CorrelationResult correlate(String alertService, Instant alertTime, int windowMinutes) {
		long started = System.nanoTime();
		List<ChangeEvent> candidates = search.findAll(ChangeQuery.between(
				alertTime.minus(Duration.ofMinutes(windowMinutes)), alertTime.plus(SuspectScorer.CLOCK_SKEW)));
		List<Suspect> suspects = candidates.stream()
			.map(c -> SuspectScorer.score(c, alertService, alertTime, catalog))
			.filter(s -> s.score() > 0)
			.sorted(Comparator.comparingInt(Suspect::score).reversed()
				.thenComparingDouble(Suspect::minutesBeforeAlert))
			.limit(MAX_SUSPECTS)
			.toList();
		long tookMs = Duration.ofNanos(System.nanoTime() - started).toMillis();
		return new CorrelationResult(alertService, alertTime, windowMinutes, candidates.size(), tookMs, suspects);
	}

}
