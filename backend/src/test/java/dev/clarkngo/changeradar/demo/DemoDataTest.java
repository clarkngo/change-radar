package dev.clarkngo.changeradar.demo;

import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;
import java.util.stream.Stream;

import dev.clarkngo.changeradar.TestFixtures;
import dev.clarkngo.changeradar.change.ChangeEvent;
import dev.clarkngo.changeradar.correlate.SuspectScorer;
import dev.clarkngo.changeradar.correlate.Suspect;
import dev.clarkngo.changeradar.ingest.ComplianceChecker;
import dev.clarkngo.changeradar.ingest.SourceRecord;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;

/** Every planted incident must rank its real culprit first, with no Elasticsearch involved. */
class DemoDataTest {

	@ParameterizedTest
	@ValueSource(strings = { "2026-01-01T00:00:00Z", "2026-06-15T13:37:00Z", "2026-10-05T22:00:00Z" })
	void plantedCulpritRanksFirst(String anchor) {
		DemoData data = new DemoData(TestFixtures.CATALOG, Instant.parse(anchor));
		List<ChangeEvent> all = Stream.<SourceRecord>concat(
				Stream.concat(data.serviceNow().stream(), data.deploys().stream()), data.flags().stream())
			.map(r -> r.normalize(TestFixtures.CATALOG))
			.filter(Objects::nonNull)
			.map(ComplianceChecker::check)
			.toList();

		assertThat(data.scenarios()).hasSize(3);
		for (DemoData.Scenario s : data.scenarios()) {
			Suspect top = all.stream()
				.filter(c -> !c.startedAt().isAfter(s.alertTime().plus(SuspectScorer.CLOCK_SKEW)))
				.filter(c -> c.startedAt().isAfter(s.alertTime().minusSeconds(120 * 60)))
				.map(c -> SuspectScorer.score(c, s.service(), s.alertTime(), TestFixtures.CATALOG))
				.max(Comparator.comparingInt(Suspect::score))
				.orElseThrow();
			assertThat(top.change().id()).as(s.id()).isEqualTo(s.culpritId());
		}
	}

}
