package dev.clarkngo.changeradar.change;

import java.time.Instant;
import java.util.Set;

/** Filters for searching changes. Every field is optional. */
public record ChangeQuery(
		String text,
		Set<String> services,
		Set<String> teams,
		Set<ChangeType> types,
		Instant from,
		Instant to,
		Boolean compliant) {

	public static ChangeQuery between(Instant from, Instant to) {
		return new ChangeQuery(null, Set.of(), Set.of(), Set.of(), from, to, null);
	}

}
