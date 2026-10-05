package dev.clarkngo.changeradar.ingest;

import java.time.Instant;
import java.util.Map;

import dev.clarkngo.changeradar.change.ChangeEvent;
import dev.clarkngo.changeradar.change.ChangeSourceType;
import dev.clarkngo.changeradar.change.ChangeType;
import dev.clarkngo.changeradar.change.Risk;
import dev.clarkngo.changeradar.ingest.deploys.DeployEvent;
import dev.clarkngo.changeradar.ingest.flags.FlagAuditEntry;
import dev.clarkngo.changeradar.ingest.servicenow.ServiceNowChange;
import org.junit.jupiter.api.Test;

import static dev.clarkngo.changeradar.TestFixtures.CATALOG;
import static org.assertj.core.api.Assertions.assertThat;

/** Each source has its own field names, time format and risk vocabulary; all must land in one shape. */
class NormalizationTest {

	@Test
	void serviceNowChangeRequest() {
		ChangeEvent e = new ServiceNowChange("abc123", "CHG0031001", "Restart data nodes", "es-cluster", "r.okafor",
				"Database", "High", "Roll back JVM image", "2026-03-01 14:05:09")
			.normalize(CATALOG);

		assertThat(e.id()).isEqualTo("servicenow:abc123");
		assertThat(e.source()).isEqualTo(ChangeSourceType.SERVICENOW);
		assertThat(e.type()).isEqualTo(ChangeType.INFRA);
		assertThat(e.team()).isEqualTo("platform");
		assertThat(e.ticket()).isEqualTo("CHG0031001");
		assertThat(e.risk()).isEqualTo(Risk.HIGH);
		assertThat(e.hasRollbackPlan()).isTrue();
		assertThat(e.startedAt()).isEqualTo(Instant.parse("2026-03-01T14:05:09Z"));
	}

	@Test
	void serviceNowBlankBackoutPlanMeansNoRollback() {
		ChangeEvent e = new ServiceNowChange("x", "CHG1", "Tweak", "payments", "a", "Software", "Moderate", "  ",
				"2026-03-01 00:00:00")
			.normalize(CATALOG);
		assertThat(e.type()).isEqualTo(ChangeType.CONFIG);
		assertThat(e.risk()).isEqualTo(Risk.MEDIUM);
		assertThat(e.hasRollbackPlan()).isFalse();
	}

	@Test
	void productionDeploy() {
		ChangeEvent e = new DeployEvent(42, "commerce/checkout", "production", "f11059e8d2c1aa", "d.romero",
				"2026-03-01T10:00:00Z", "Migrate orders table", Map.of("irreversible", "true", "risk", "high"))
			.normalize(CATALOG);

		assertThat(e.id()).isEqualTo("deploys:42");
		assertThat(e.service()).isEqualTo("checkout");
		assertThat(e.summary()).isEqualTo("Deploy f11059e: Migrate orders table");
		assertThat(e.ticket()).isNull();
		assertThat(e.risk()).isEqualTo(Risk.HIGH);
		assertThat(e.hasRollbackPlan()).isFalse();
	}

	@Test
	void nonProductionDeploysAreSkipped() {
		assertThat(new DeployEvent(1, "commerce/checkout", "staging", "abc", "x", "2026-03-01T10:00:00Z", "d", null)
			.normalize(CATALOG)).isNull();
	}

	@Test
	void flagRolloutToFullTrafficIsHighRisk() {
		ChangeEvent e = new FlagAuditEntry("fa_1", "bidder.pacing-v2", "ads-bidder", "ROLLOUT_CHANGED", "10%",
				"100%", "j.patel", 1_772_000_000_000L, null)
			.normalize(CATALOG);

		assertThat(e.type()).isEqualTo(ChangeType.FEATURE_FLAG);
		assertThat(e.risk()).isEqualTo(Risk.HIGH);
		assertThat(e.summary()).isEqualTo("Flag bidder.pacing-v2 rollout changed (10% → 100%)");
		assertThat(e.startedAt()).isEqualTo(Instant.ofEpochMilli(1_772_000_000_000L));
	}

	@Test
	void flagRiskByAction() {
		assertThat(flagRisk("DISABLED", "off")).isEqualTo(Risk.LOW);
		assertThat(flagRisk("ENABLED", "on")).isEqualTo(Risk.MEDIUM);
		assertThat(flagRisk("ROLLOUT_CHANGED", "25%")).isEqualTo(Risk.LOW);
	}

	private static Risk flagRisk(String action, String to) {
		return new FlagAuditEntry("fa", "k", "payments", action, "", to, "a", 0, null).normalize(CATALOG).risk();
	}

	@Test
	void complianceFlagsMissingMetadata() {
		ChangeEvent e = ComplianceChecker.check(new DeployEvent(42, "commerce/checkout", "production", "abc",
				"", "2026-03-01T10:00:00Z", "d", Map.of("irreversible", "true"))
			.normalize(CATALOG));
		assertThat(e.missingMetadata()).containsExactly("ticket", "rollbackPlan", "owner");
		assertThat(e.compliant()).isFalse();
	}

}
