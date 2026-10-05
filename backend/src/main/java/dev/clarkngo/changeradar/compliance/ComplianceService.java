package dev.clarkngo.changeradar.compliance;

import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.function.Function;
import java.util.stream.Collectors;

import dev.clarkngo.changeradar.change.ChangeEvent;
import dev.clarkngo.changeradar.change.ChangeQuery;
import dev.clarkngo.changeradar.change.ChangeSearchService;
import org.springframework.stereotype.Service;

/**
 * Per-team adherence to the change guidelines. Each team sees its own numbers, which is what
 * actually persuades people to change habits.
 */
@Service
public class ComplianceService {

	public record TeamCompliance(String team, int total, int compliant, double rate, Map<String, Long> missing,
			List<String> services) {
	}

	public record Report(Instant from, Instant to, int total, double overallRate, List<TeamCompliance> teams) {
	}

	private final ChangeSearchService search;

	public ComplianceService(ChangeSearchService search) {
		this.search = search;
	}

	public Report report(Instant from, Instant to) {
		return summarize(from, to, search.findAll(ChangeQuery.between(from, to)));
	}

	static Report summarize(Instant from, Instant to, List<ChangeEvent> changes) {
		List<TeamCompliance> teams = changes.stream()
			.collect(Collectors.groupingBy(ChangeEvent::team))
			.entrySet()
			.stream()
			.map(e -> teamCompliance(e.getKey(), e.getValue()))
			.sorted(Comparator.comparingDouble(TeamCompliance::rate).thenComparing(TeamCompliance::team))
			.toList();
		long compliant = changes.stream().filter(ChangeEvent::compliant).count();
		return new Report(from, to, changes.size(), rate(compliant, changes.size()), teams);
	}

	private static TeamCompliance teamCompliance(String team, List<ChangeEvent> changes) {
		long compliant = changes.stream().filter(ChangeEvent::compliant).count();
		Map<String, Long> missing = changes.stream()
			.flatMap(c -> c.missingMetadata().stream())
			.collect(Collectors.groupingBy(Function.identity(), TreeMap::new, Collectors.counting()));
		List<String> services = changes.stream().map(ChangeEvent::service).distinct().sorted().toList();
		return new TeamCompliance(team, changes.size(), (int) compliant, rate(compliant, changes.size()), missing,
				services);
	}

	private static double rate(long part, int total) {
		return total == 0 ? 1.0 : Math.round(1000.0 * part / total) / 1000.0;
	}

}
