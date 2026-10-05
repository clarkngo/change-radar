package dev.clarkngo.changeradar.correlate;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import dev.clarkngo.changeradar.catalog.ServiceCatalog;
import dev.clarkngo.changeradar.change.ChangeEvent;
import dev.clarkngo.changeradar.change.ChangeType;
import dev.clarkngo.changeradar.change.Risk;

/**
 * Scores how likely a change is to have caused an alert, from 0 to 100. The score multiplies four factors:
 *
 * <ul>
 * <li><b>proximity</b>: halves every {@value #HALF_LIFE_MINUTES} minutes before the alert</li>
 * <li><b>blast radius</b>: the alerting service itself, then its dependencies, fading with each hop</li>
 * <li><b>change type</b>: code deploys first, then config, infra and flag flips</li>
 * <li><b>declared risk</b></li>
 * </ul>
 *
 * The browser demo (frontend/src/api/scoring.ts) uses the same formula. Both are tested against
 * shared/scoring-cases.json so they stay in sync.
 */
public final class SuspectScorer {

	public static final double HALF_LIFE_MINUTES = 15;

	/** A change starting slightly after the alert is still suspicious, because clocks drift and alerts lag. */
	public static final Duration CLOCK_SKEW = Duration.ofMinutes(5);

	private SuspectScorer() {
	}

	public static Suspect score(ChangeEvent change, String alertService, Instant alertTime, ServiceCatalog catalog) {
		List<String> reasons = new ArrayList<>();

		double minutesBefore = Duration.between(change.startedAt(), alertTime).toSeconds() / 60.0;
		double proximity;
		if (minutesBefore < 0) {
			proximity = 0.3;
			reasons.add(String.format("Started %.0f min after the alert (possible clock skew)", -minutesBefore));
		}
		else {
			proximity = Math.pow(0.5, minutesBefore / HALF_LIFE_MINUTES);
			reasons.add(String.format("Started %.0f min before the alert", minutesBefore));
		}

		int distance = catalog.dependencyDistance(alertService, change.service());
		double blast = blastWeight(distance, change.type());
		reasons.add(switch (distance) {
			case 0 -> "Same service as the alert";
			case 1 -> alertService + " depends on " + change.service();
			case -1 -> change.type() == ChangeType.INFRA ? "Shared infrastructure change" : "No known dependency";
			default -> change.service() + " is " + distance + " hops upstream of " + alertService;
		});

		double typeWeight = typeWeight(change.type());
		double riskFactor = riskFactor(change.risk());
		if (change.risk() == Risk.HIGH) {
			reasons.add("Declared high risk");
		}
		if (!change.compliant()) {
			reasons.add("Missing " + String.join(", ", change.missingMetadata()));
		}

		int score = (int) Math.round(100 * Math.min(1.0, proximity * blast * typeWeight * riskFactor));
		return new Suspect(change, score, minutesBefore, distance, reasons);
	}

	static double blastWeight(int distance, ChangeType type) {
		return switch (distance) {
			case 0 -> 1.0;
			case 1 -> 0.7;
			case 2 -> 0.4;
			case -1 -> type == ChangeType.INFRA ? 0.3 : 0.1;
			default -> 0.2;
		};
	}

	static double typeWeight(ChangeType type) {
		return switch (type) {
			case DEPLOY -> 1.0;
			case CONFIG, INFRA -> 0.9;
			case FEATURE_FLAG -> 0.85;
		};
	}

	static double riskFactor(Risk risk) {
		return switch (risk) {
			case HIGH -> 1.2;
			case MEDIUM -> 1.0;
			case LOW -> 0.85;
		};
	}

}
