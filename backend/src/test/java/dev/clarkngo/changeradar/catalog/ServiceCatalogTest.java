package dev.clarkngo.changeradar.catalog;

import java.util.List;
import java.util.Map;

import dev.clarkngo.changeradar.catalog.ServiceCatalog.ServiceInfo;
import org.junit.jupiter.api.Test;

import static dev.clarkngo.changeradar.TestFixtures.CATALOG;
import static org.assertj.core.api.Assertions.assertThat;

class ServiceCatalogTest {

	@Test
	void measuresDependencyHops() {
		assertThat(CATALOG.dependencyDistance("search-api", "search-api")).isZero();
		assertThat(CATALOG.dependencyDistance("search-api", "search-index")).isEqualTo(1);
		assertThat(CATALOG.dependencyDistance("search-api", "es-cluster")).isEqualTo(2);
	}

	@Test
	void dependenciesOnlyFlowOneWay() {
		assertThat(CATALOG.dependencyDistance("es-cluster", "search-api")).isEqualTo(-1);
		assertThat(CATALOG.dependencyDistance("search-api", "ads-index")).isEqualTo(-1);
	}

	@Test
	void usesShortestPathWhenSeveralExist() {
		ServiceCatalog diamond = new ServiceCatalog(Map.of("a", new ServiceInfo("t", List.of("b", "d")), "b",
				new ServiceInfo("t", List.of("c")), "c", new ServiceInfo("t", List.of("d")), "d",
				new ServiceInfo("t", null)));
		assertThat(diamond.dependencyDistance("a", "d")).isEqualTo(1);
	}

	@Test
	void survivesDependencyCycles() {
		ServiceCatalog cyclic = new ServiceCatalog(
				Map.of("a", new ServiceInfo("t", List.of("b")), "b", new ServiceInfo("t", List.of("a"))));
		assertThat(cyclic.dependencyDistance("a", "missing")).isEqualTo(-1);
	}

	@Test
	void unknownServicesBelongToUnknownTeam() {
		assertThat(CATALOG.teamOf("checkout")).isEqualTo("commerce");
		assertThat(CATALOG.teamOf("nope")).isEqualTo(ServiceCatalog.UNKNOWN_TEAM);
	}

}
