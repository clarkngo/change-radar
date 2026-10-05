package dev.clarkngo.changeradar;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Set;

import dev.clarkngo.changeradar.change.ChangeEvent;
import dev.clarkngo.changeradar.change.ChangeQuery;
import dev.clarkngo.changeradar.change.ChangeSearchService;
import dev.clarkngo.changeradar.change.ChangeType;
import dev.clarkngo.changeradar.correlate.CorrelationResult;
import dev.clarkngo.changeradar.correlate.CorrelationService;
import dev.clarkngo.changeradar.demo.DemoData;
import dev.clarkngo.changeradar.ingest.IngestService;
import dev.clarkngo.changeradar.ingest.IngestService.SourceRunResult;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.elasticsearch.core.ElasticsearchOperations;
import org.testcontainers.elasticsearch.ElasticsearchContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The full pipeline against a real Elasticsearch: mock sources over HTTP, then Spring Batch ingestion,
 * then the index, then search and correlation.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.DEFINED_PORT,
		properties = { "server.port=18085", "changeradar.ingest.scheduled=false", "changeradar.index-name=changes-it" })
@Testcontainers
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class ChangeRadarIntegrationTest {

	@Container
	@ServiceConnection
	static final ElasticsearchContainer elasticsearch = new ElasticsearchContainer("elasticsearch:9.4.6")
		.withEnv("xpack.security.enabled", "false")
		.withEnv("ES_JAVA_OPTS", "-Xms512m -Xmx512m");

	@Autowired
	IngestService ingest;

	@Autowired
	ChangeSearchService search;

	@Autowired
	CorrelationService correlation;

	@Autowired
	DemoData demo;

	@Autowired
	ElasticsearchOperations operations;

	List<SourceRunResult> firstRun;

	@BeforeAll
	void ingestOnce() {
		firstRun = ingest.runAll();
		operations.indexOps(ChangeEvent.class).refresh();
	}

	@Test
	void ingestsEverySourceAndSkipsNonProductionDeploys() {
		assertThat(firstRun).extracting(SourceRunResult::status).containsOnly("COMPLETED");
		long staging = demo.deploys().stream().filter(d -> !d.environment().equals("production")).count();
		SourceRunResult deploys = firstRun.stream().filter(r -> r.source().equals("deploys")).findFirst().orElseThrow();
		assertThat(deploys.read()).isEqualTo(demo.deploys().size());
		assertThat(deploys.skipped()).isEqualTo(staging);
	}

	@Test
	void reingestingIsIdempotent() {
		long before = operations.count(org.springframework.data.elasticsearch.client.elc.NativeQuery.builder().build(),
				ChangeEvent.class);
		ingest.runAll();
		operations.indexOps(ChangeEvent.class).refresh();
		long after = operations.count(org.springframework.data.elasticsearch.client.elc.NativeQuery.builder().build(),
				ChangeEvent.class);
		assertThat(after).isEqualTo(before).isPositive();
	}

	@Test
	void correlationFindsEveryPlantedCulprit() {
		for (DemoData.Scenario s : demo.scenarios()) {
			CorrelationResult result = correlation.correlate(s.service(), s.alertTime(),
					CorrelationService.DEFAULT_WINDOW_MINUTES);
			assertThat(result.suspects()).as(s.id()).isNotEmpty();
			assertThat(result.suspects().getFirst().change().id()).as(s.id()).isEqualTo(s.culpritId());
		}
	}

	@Test
	void searchCombinesTextAndFilters() {
		Instant now = Instant.now();
		var page = search.search(new ChangeQuery("orders migrate", Set.of("checkout"), null, Set.of(ChangeType.DEPLOY),
				now.minus(Duration.ofDays(4)), now, false), PageRequest.of(0, 10));
		assertThat(page.getContent()).extracting(ChangeEvent::summary).anyMatch(s -> s.contains("orders table"));
		assertThat(page.getContent()).allMatch(c -> !c.compliant() && c.service().equals("checkout"));
	}

}
