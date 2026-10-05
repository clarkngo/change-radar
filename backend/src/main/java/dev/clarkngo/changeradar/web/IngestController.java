package dev.clarkngo.changeradar.web;

import java.util.List;

import dev.clarkngo.changeradar.ingest.IngestService;
import dev.clarkngo.changeradar.ingest.IngestService.SourceRunResult;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/ingest")
class IngestController {

	private final IngestService ingest;

	IngestController(IngestService ingest) {
		this.ingest = ingest;
	}

	@PostMapping
	List<SourceRunResult> run() {
		return ingest.runAll();
	}

	@GetMapping("/status")
	List<SourceRunResult> status() {
		return ingest.lastRun();
	}

}
