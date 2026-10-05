package dev.clarkngo.changeradar.compliance;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import dev.clarkngo.changeradar.TestFixtures;
import dev.clarkngo.changeradar.change.ChangeEvent;
import dev.clarkngo.changeradar.change.ChangeType;
import dev.clarkngo.changeradar.change.Risk;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class ComplianceServiceTest {

	private static ChangeEvent change(String service, String team, List<String> missing) {
		ChangeEvent c = TestFixtures.change(service, ChangeType.DEPLOY, Risk.LOW, Instant.EPOCH, missing);
		return new ChangeEvent(c.id() + team + missing, c.source(), c.externalId(), c.type(), service, team,
				c.summary(), c.author(), c.ticket(), c.risk(), c.hasRollbackPlan(), c.startedAt(), missing);
	}

	@Test
	void worstTeamsFirstWithMissingFieldCounts() {
		ComplianceService.Report report = ComplianceService.summarize(Instant.EPOCH, Instant.EPOCH, List.of(
				change("search-api", "search", List.of("ticket")),
				change("search-index", "search", List.of("ticket", "rollbackPlan")),
				change("search-api", "search", List.of()),
				change("checkout", "commerce", List.of())));

		assertThat(report.total()).isEqualTo(4);
		assertThat(report.overallRate()).isEqualTo(0.5);
		assertThat(report.teams()).extracting(ComplianceService.TeamCompliance::team)
			.containsExactly("search", "commerce");
		ComplianceService.TeamCompliance search = report.teams().getFirst();
		assertThat(search.rate()).isEqualTo(0.333);
		assertThat(search.missing()).isEqualTo(Map.of("rollbackPlan", 1L, "ticket", 2L));
		assertThat(search.services()).containsExactly("search-api", "search-index");
	}

	@Test
	void emptyPeriodCountsAsFullyCompliant() {
		assertThat(ComplianceService.summarize(Instant.EPOCH, Instant.EPOCH, List.of()).overallRate()).isEqualTo(1.0);
	}

}
