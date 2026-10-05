package dev.clarkngo.changeradar.ingest;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import dev.clarkngo.changeradar.catalog.ServiceCatalog;
import dev.clarkngo.changeradar.change.ChangeEvent;
import dev.clarkngo.changeradar.change.ChangeEventRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.batch.core.job.Job;
import org.springframework.batch.core.job.JobExecution;
import org.springframework.batch.core.job.builder.JobBuilder;
import org.springframework.batch.core.job.parameters.JobParametersBuilder;
import org.springframework.batch.core.launch.JobOperator;
import org.springframework.batch.core.repository.JobRepository;
import org.springframework.batch.core.step.Step;
import org.springframework.batch.core.step.StepExecution;
import org.springframework.batch.core.step.builder.StepBuilder;
import org.springframework.batch.infrastructure.item.ItemProcessor;
import org.springframework.batch.infrastructure.item.ItemWriter;
import org.springframework.stereotype.Service;

/**
 * Pulls every {@link ChangeSource} into Elasticsearch. Each source runs as its own Spring Batch
 * job, so one source being down doesn't stop the others from being ingested.
 */
@Service
public class IngestService {

	private static final Logger log = LoggerFactory.getLogger(IngestService.class);

	private final List<ChangeSource> sources;
	private final ServiceCatalog catalog;
	private final ChangeEventRepository repository;
	private final JobRepository jobRepository;
	private final JobOperator jobOperator;
	private final IngestProperties properties;

	private volatile List<SourceRunResult> lastRun = List.of();

	public IngestService(List<ChangeSource> sources, ServiceCatalog catalog, ChangeEventRepository repository,
			JobRepository jobRepository, JobOperator jobOperator, IngestProperties properties) {
		this.sources = sources;
		this.catalog = catalog;
		this.repository = repository;
		this.jobRepository = jobRepository;
		this.jobOperator = jobOperator;
		this.properties = properties;
	}

	public record SourceRunResult(String source, String status, long read, long written, long skipped,
			long durationMs, String error) {
	}

	public synchronized List<SourceRunResult> runAll() {
		List<SourceRunResult> results = new ArrayList<>();
		for (ChangeSource source : sources) {
			results.add(run(source));
		}
		lastRun = List.copyOf(results);
		return results;
	}

	public List<SourceRunResult> lastRun() {
		return lastRun;
	}

	private SourceRunResult run(ChangeSource source) {
		Instant started = Instant.now();
		try {
			JobExecution execution = jobOperator.start(buildJob(source),
					new JobParametersBuilder().addLong("run.ts", started.toEpochMilli()).toJobParameters());
			long read = 0;
			long written = 0;
			long skipped = 0;
			String error = null;
			for (StepExecution step : execution.getStepExecutions()) {
				read += step.getReadCount();
				written += step.getWriteCount();
				skipped += step.getFilterCount();
				if (!step.getFailureExceptions().isEmpty()) {
					error = rootMessage(step.getFailureExceptions().getFirst());
				}
			}
			SourceRunResult result = new SourceRunResult(source.name(), execution.getStatus().name(), read, written,
					skipped, Duration.between(started, Instant.now()).toMillis(), error);
			log.info("Ingested {}: {}", source.name(), result);
			return result;
		}
		catch (Exception e) {
			log.warn("Ingest of {} could not start", source.name(), e);
			return new SourceRunResult(source.name(), "FAILED", 0, 0, 0,
					Duration.between(started, Instant.now()).toMillis(), rootMessage(e));
		}
	}

	private Job buildJob(ChangeSource source) {
		// Readers hold paging state, so each run gets a fresh one.
		Step step = new StepBuilder("ingest-" + source.name(), jobRepository)
			.<SourceRecord, ChangeEvent>chunk(properties.chunkSize())
			.reader(new PagedSourceReader(source, properties.pageSize()))
			.processor(processor())
			.writer(writer())
			.build();
		return new JobBuilder("ingest-" + source.name(), jobRepository).start(step).build();
	}

	private ItemProcessor<SourceRecord, ChangeEvent> processor() {
		return record -> {
			ChangeEvent normalized = record.normalize(catalog);
			return normalized == null ? null : ComplianceChecker.check(normalized);
		};
	}

	private ItemWriter<ChangeEvent> writer() {
		return chunk -> repository.saveAll(chunk.getItems());
	}

	private static String rootMessage(Throwable t) {
		Throwable root = t;
		while (root.getCause() != null) {
			root = root.getCause();
		}
		return root.getClass().getSimpleName() + ": " + root.getMessage();
	}

}
