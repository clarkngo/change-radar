package dev.clarkngo.changeradar.demo;

import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Random;

import dev.clarkngo.changeradar.catalog.ServiceCatalog;
import dev.clarkngo.changeradar.ingest.deploys.DeployEvent;
import dev.clarkngo.changeradar.ingest.flags.FlagAuditEntry;
import dev.clarkngo.changeradar.ingest.servicenow.ServiceNowChange;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/**
 * Deterministic fake change history covering the 72 hours before startup, in each source's own raw format.
 * Three incidents are planted, each with a real culprit and some decoys. Background noise is kept out
 * of their windows so the right answer can be checked.
 */
@Component
@Profile("demo")
public class DemoData {

	public record Scenario(String id, String title, String service, Instant alertTime, String culpritId,
			String narrative) {
	}

	private static final Duration HISTORY = Duration.ofHours(72);
	private static final Duration PROTECTED_BEFORE = Duration.ofMinutes(90);
	private static final Duration PROTECTED_AFTER = Duration.ofMinutes(10);

	/** How reliably each team follows the change guidelines, for the compliance report. */
	private static final Map<String, Double> TEAM_DISCIPLINE = Map.of("ads", 0.95, "ads-data", 0.85,
			"experimentation", 0.7, "search", 0.5, "platform", 0.9, "commerce", 0.72, "commerce-payments", 0.92);

	private static final List<String> ENGINEERS = List.of("a.nguyen", "j.patel", "m.garcia", "s.kim", "r.okafor",
			"l.chen", "d.romero", "k.ito", "p.singh", "e.walsh");

	private final ServiceCatalog catalog;
	private final Instant anchor;
	private final Random random = new Random(42);
	private final List<ServiceNowChange> serviceNow = new ArrayList<>();
	private final List<DeployEvent> deploys = new ArrayList<>();
	private final List<FlagAuditEntry> flags = new ArrayList<>();
	private final List<Scenario> scenarios = new ArrayList<>();
	private long nextId = 1000;

	@Autowired
	public DemoData(ServiceCatalog catalog) {
		this(catalog, Instant.now().truncatedTo(ChronoUnit.MINUTES));
	}

	DemoData(ServiceCatalog catalog, Instant anchor) {
		this.catalog = catalog;
		this.anchor = anchor;
		plantScenarios();
		generateBackground();
		serviceNow.sort(Comparator.comparing(ServiceNowChange::startDate).reversed());
		deploys.sort(Comparator.comparing(DeployEvent::createdAt).reversed());
		flags.sort(Comparator.comparingLong(FlagAuditEntry::timestamp).reversed());
	}

	public List<ServiceNowChange> serviceNow() {
		return serviceNow;
	}

	public List<DeployEvent> deploys() {
		return deploys;
	}

	public List<FlagAuditEntry> flags() {
		return flags;
	}

	public List<Scenario> scenarios() {
		return scenarios;
	}

	private void plantScenarios() {
		Instant a1 = anchor.minus(Duration.ofMinutes(25));
		String flagId = flag("ads-bidder", "bidder.pacing-v2", "ROLLOUT_CHANGED", "10%", "100%", "j.patel",
				a1.minus(Duration.ofMinutes(6)), null);
		deploy("ads-serving", "Bump ad-renderer to 4.12 for new creative formats", "a.nguyen",
				a1.minus(Duration.ofMinutes(48)), "ADS-2291", "low", false);
		deploy("checkout", "Copy tweak on order confirmation page", "e.walsh", a1.minus(Duration.ofMinutes(3)),
				"COM-881", "low", false);
		scenarios.add(new Scenario("ads-5xx", "Ad serving 5xx rate above 2%", "ads-serving", a1,
				"feature_flags:" + flagId,
				"A flag on a dependency went to 100% six minutes earlier, with no ticket. A same-service deploy 48 minutes earlier and an unrelated checkout deploy are decoys."));

		Instant a2 = anchor.minus(Duration.ofHours(6));
		String crId = serviceNowChange("es-cluster", "Rolling restart of es-cluster data nodes for JVM upgrade",
				"r.okafor", "Database", "High", "Restart nodes on previous JVM image", a2.minus(Duration.ofMinutes(12)));
		deploy("search-api", "Add synonym expansion behind query param", "s.kim", a2.minus(Duration.ofMinutes(95)),
				null, "medium", false);
		deploy("ads-index", "Reindex job tuning", "k.ito", a2.minus(Duration.ofMinutes(10)), "ADSD-140", "low",
				false);
		scenarios.add(new Scenario("search-latency", "Search p99 latency above 800 ms", "search-api", a2,
				"servicenow:" + crId,
				"An infrastructure change two hops upstream (search-api → search-index → es-cluster). An ads-index deploy at nearly the same time is a decoy because search-api doesn't depend on it."));

		Instant a3 = anchor.minus(Duration.ofHours(20));
		String deployId = deploy("checkout", "Migrate orders table to v2 schema", "d.romero",
				a3.minus(Duration.ofMinutes(4)), null, "medium", true);
		flag("payments", "payments.3ds-challenge", "ENABLED", "off", "on", "p.singh", a3.minus(Duration.ofMinutes(30)),
				"PAY-77");
		scenarios.add(new Scenario("checkout-errors", "Checkout error rate above 5%", "checkout", a3,
				"deploys:" + deployId,
				"A same-service deploy four minutes earlier with no ticket and no rollback path (a schema migration). A payments flag 30 minutes earlier is a decoy."));
	}

	private void generateBackground() {
		List<String> services = catalog.services().keySet().stream().sorted().toList();
		for (int i = 0; i < 160; i++) {
			String service = pick(services.stream().filter(s -> !s.equals("es-cluster")).toList());
			Instant at = randomTime();
			if (isProtected(service, at)) {
				continue;
			}
			boolean disciplined = followsGuidelines(service);
			String env = random.nextDouble() < 0.2 ? "staging" : "production";
			deploy(service, pick(DEPLOY_SUMMARIES), pick(ENGINEERS), at,
					disciplined ? ticketFor(service) : null, pick(List.of("low", "medium", "medium", "high")),
					!disciplined && random.nextDouble() < 0.3, env);
		}
		List<String> infraHeavy = List.of("es-cluster", "es-cluster", "payments", "inventory", "budget-service",
				"search-index", "experiment-service");
		for (int i = 0; i < 45; i++) {
			String service = pick(infraHeavy);
			Instant at = randomTime();
			if (isProtected(service, at)) {
				continue;
			}
			boolean disciplined = followsGuidelines(service);
			serviceNowChange(service, pick(CR_SUMMARIES), pick(ENGINEERS),
					pick(List.of("Software", "Database", "Network")), pick(List.of("Low", "Moderate", "High")),
					disciplined ? "Revert via standard runbook" : "", at);
		}
		for (int i = 0; i < 90; i++) {
			String service = pick(services.stream().filter(s -> !s.equals("es-cluster")).toList());
			Instant at = randomTime();
			if (isProtected(service, at)) {
				continue;
			}
			String action = pick(List.of("ENABLED", "DISABLED", "ROLLOUT_CHANGED", "ROLLOUT_CHANGED"));
			String[] values = switch (action) {
				case "ENABLED" -> new String[] { "off", "on" };
				case "DISABLED" -> new String[] { "on", "off" };
				default -> {
					int from = pick(List.of(0, 5, 10, 25, 50));
					yield new String[] { from + "%", pick(List.of(10, 25, 50, 100).stream().filter(v -> v > from).toList()) + "%" };
				}
			};
			flag(service, service.split("-")[0] + "." + pick(FLAG_NAMES), action, values[0], values[1],
					pick(ENGINEERS), at, followsGuidelines(service) ? ticketFor(service) : null);
		}
	}

	private boolean isProtected(String service, Instant at) {
		return scenarios.stream()
			.anyMatch(s -> !at.isBefore(s.alertTime().minus(PROTECTED_BEFORE))
					&& !at.isAfter(s.alertTime().plus(PROTECTED_AFTER))
					&& catalog.dependencyDistance(s.service(), service) >= 0);
	}

	private boolean followsGuidelines(String service) {
		return random.nextDouble() < TEAM_DISCIPLINE.getOrDefault(catalog.teamOf(service), 0.8);
	}

	private String ticketFor(String service) {
		String prefix = catalog.teamOf(service).replace("-", "").toUpperCase();
		return prefix.substring(0, Math.min(4, prefix.length())) + "-" + (100 + random.nextInt(3000));
	}

	private Instant randomTime() {
		return anchor.minusSeconds((long) (random.nextDouble() * HISTORY.toSeconds())).truncatedTo(ChronoUnit.SECONDS);
	}

	private <T> T pick(List<T> items) {
		return items.get(random.nextInt(items.size()));
	}

	private String deploy(String service, String description, String creator, Instant at, String ticket, String risk,
			boolean irreversible) {
		return deploy(service, description, creator, at, ticket, risk, irreversible, "production");
	}

	private String deploy(String service, String description, String creator, Instant at, String ticket, String risk,
			boolean irreversible, String environment) {
		long id = nextId++;
		byte[] sha = new byte[20];
		random.nextBytes(sha);
		Map<String, String> payload = new java.util.HashMap<>();
		payload.put("risk", risk);
		if (ticket != null) {
			payload.put("ticket", ticket);
		}
		if (irreversible) {
			payload.put("irreversible", "true");
		}
		deploys.add(new DeployEvent(id, catalog.teamOf(service) + "/" + service, environment,
				HexFormat.of().formatHex(sha), creator, at.toString(), description, payload));
		return Long.toString(id);
	}

	private String serviceNowChange(String service, String description, String assignee, String category,
			String risk, String backoutPlan, Instant at) {
		long n = nextId++;
		String sysId = HexFormat.of().toHexDigits(n * 2654435761L);
		serviceNow.add(new ServiceNowChange(sysId, "CHG00" + (31000 + n), description, service, assignee, category,
				risk, backoutPlan, ServiceNowChangeTimes.format(at)));
		return sysId;
	}

	private String flag(String service, String key, String action, String from, String to, String actor, Instant at,
			String ticket) {
		String id = "fa_" + (nextId++);
		flags.add(new FlagAuditEntry(id, key, service, action, from, to, actor, at.toEpochMilli(), ticket));
		return id;
	}

	/** ServiceNow's display format is UTC "yyyy-MM-dd HH:mm:ss". */
	static final class ServiceNowChangeTimes {

		private static final java.time.format.DateTimeFormatter FORMAT = java.time.format.DateTimeFormatter
			.ofPattern("yyyy-MM-dd HH:mm:ss")
			.withZone(ZoneOffset.UTC);

		static String format(Instant at) {
			return FORMAT.format(at);
		}

	}

	private static final List<String> DEPLOY_SUMMARIES = List.of("Fix null check in request handler",
			"Upgrade HTTP client library", "Add request tracing spans", "Tune connection pool size",
			"Refactor pricing calculation", "Roll out new caching layer", "Patch CVE in transitive dependency",
			"Improve retry backoff", "Add metrics for queue depth", "Clean up deprecated endpoints",
			"Increase timeout for downstream calls", "Ship A/B treatment for ranking tweak");

	private static final List<String> CR_SUMMARIES = List.of("Increase heap size on data nodes",
			"Rotate TLS certificates", "Apply OS security patches", "Expand disk on primary replica",
			"Update load balancer health check path", "Migrate cron jobs to new scheduler",
			"Adjust autoscaling thresholds", "Change DNS TTL for internal endpoints");

	private static final List<String> FLAG_NAMES = List.of("new-ranker", "async-writes", "edge-cache", "v2-api",
			"batch-size-up", "strict-validation", "shadow-traffic", "fast-path");

}
