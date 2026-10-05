package dev.clarkngo.changeradar;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import dev.clarkngo.changeradar.catalog.ServiceCatalog;
import dev.clarkngo.changeradar.catalog.ServiceCatalog.ServiceInfo;
import dev.clarkngo.changeradar.change.ChangeEvent;
import dev.clarkngo.changeradar.change.ChangeSourceType;
import dev.clarkngo.changeradar.change.ChangeType;
import dev.clarkngo.changeradar.change.Risk;

public final class TestFixtures {

	/** Same topology as application.yml. */
	public static final ServiceCatalog CATALOG = new ServiceCatalog(Map.ofEntries(
			Map.entry("ads-serving", new ServiceInfo("ads", List.of("ads-bidder", "ads-index", "experiment-service"))),
			Map.entry("ads-bidder", new ServiceInfo("ads", List.of("budget-service"))),
			Map.entry("ads-index", new ServiceInfo("ads-data", List.of("es-cluster"))),
			Map.entry("budget-service", new ServiceInfo("ads-data", null)),
			Map.entry("experiment-service", new ServiceInfo("experimentation", null)),
			Map.entry("search-api", new ServiceInfo("search", List.of("search-index", "experiment-service"))),
			Map.entry("search-index", new ServiceInfo("search", List.of("es-cluster"))),
			Map.entry("es-cluster", new ServiceInfo("platform", null)),
			Map.entry("checkout", new ServiceInfo("commerce", List.of("payments", "inventory"))),
			Map.entry("payments", new ServiceInfo("commerce-payments", null)),
			Map.entry("inventory", new ServiceInfo("commerce", null))));

	private TestFixtures() {
	}

	public static ChangeEvent change(String service, ChangeType type, Risk risk, Instant at, List<String> missing) {
		return new ChangeEvent("test:" + service + at, ChangeSourceType.DEPLOYS, service + at, type, service, "team",
				"test change", "someone", "T-1", risk, true, at, missing);
	}

}
