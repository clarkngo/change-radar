package dev.clarkngo.changeradar.correlate;

import java.io.File;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

import dev.clarkngo.changeradar.TestFixtures;
import dev.clarkngo.changeradar.catalog.ServiceCatalog;
import dev.clarkngo.changeradar.catalog.ServiceCatalog.ServiceInfo;
import dev.clarkngo.changeradar.change.ChangeType;
import dev.clarkngo.changeradar.change.Risk;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import tools.jackson.databind.json.JsonMapper;

import static org.assertj.core.api.Assertions.assertThat;

class SuspectScorerTest {

	record CaseChange(String service, ChangeType type, Risk risk, double minutesBeforeAlert) {
	}

	record Case(String name, CaseChange change, int expectedScore, int expectedDistance) {
		@Override
		public String toString() {
			return name;
		}
	}

	record Cases(String alertService, Instant alertTime, Map<String, ServiceInfo> catalog, List<Case> cases) {
	}

	/** The same file drives frontend/src/api/scoring.test.ts, so the browser demo can't drift from the backend. */
	static final Cases SHARED = JsonMapper.builder().build()
		.readValue(new File("../shared/scoring-cases.json"), Cases.class);

	static Stream<Case> sharedCases() {
		return SHARED.cases().stream();
	}

	@ParameterizedTest(name = "{0}")
	@MethodSource("sharedCases")
	void matchesSharedScoringCases(Case c) {
		ServiceCatalog catalog = new ServiceCatalog(SHARED.catalog());
		Instant startedAt = SHARED.alertTime().minusSeconds((long) (c.change().minutesBeforeAlert() * 60));
		Suspect suspect = SuspectScorer.score(
				TestFixtures.change(c.change().service(), c.change().type(), c.change().risk(), startedAt, List.of()),
				SHARED.alertService(), SHARED.alertTime(), catalog);

		assertThat(suspect.score()).isEqualTo(c.expectedScore());
		assertThat(suspect.dependencyDistance()).isEqualTo(c.expectedDistance());
	}

	@Test
	void explainsItsReasoning() {
		Instant alert = Instant.parse("2026-01-01T12:00:00Z");
		Suspect suspect = SuspectScorer.score(TestFixtures.change("ads-bidder", ChangeType.FEATURE_FLAG, Risk.HIGH,
				alert.minus(Duration.ofMinutes(6)), List.of("ticket")), "ads-serving", alert, TestFixtures.CATALOG);

		assertThat(suspect.reasons()).containsExactly("Started 6 min before the alert",
				"ads-serving depends on ads-bidder", "Declared high risk", "Missing ticket");
	}

	@Test
	void closerChangesOutrankOlderOnes() {
		Instant alert = Instant.parse("2026-01-01T12:00:00Z");
		int recent = SuspectScorer.score(TestFixtures.change("checkout", ChangeType.DEPLOY, Risk.MEDIUM,
				alert.minus(Duration.ofMinutes(5)), List.of()), "checkout", alert, TestFixtures.CATALOG).score();
		int older = SuspectScorer.score(TestFixtures.change("checkout", ChangeType.DEPLOY, Risk.MEDIUM,
				alert.minus(Duration.ofMinutes(50)), List.of()), "checkout", alert, TestFixtures.CATALOG).score();
		assertThat(recent).isGreaterThan(older);
	}

}
