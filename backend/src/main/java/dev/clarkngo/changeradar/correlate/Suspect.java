package dev.clarkngo.changeradar.correlate;

import java.util.List;

import dev.clarkngo.changeradar.change.ChangeEvent;

/**
 * A change ranked against an alert. {@code dependencyDistance} is -1 when the change's service isn't
 * upstream of the alerting service.
 */
public record Suspect(ChangeEvent change, int score, double minutesBeforeAlert, int dependencyDistance,
		List<String> reasons) {
}
