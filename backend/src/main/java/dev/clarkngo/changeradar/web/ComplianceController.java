package dev.clarkngo.changeradar.web;

import java.time.Duration;
import java.time.Instant;

import dev.clarkngo.changeradar.compliance.ComplianceService;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
class ComplianceController {

	private final ComplianceService compliance;

	ComplianceController(ComplianceService compliance) {
		this.compliance = compliance;
	}

	/** Defaults to the last 7 days. */
	@GetMapping("/api/compliance")
	ComplianceService.Report report(
			@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant from,
			@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant to) {
		Instant end = to == null ? Instant.now() : to;
		Instant start = from == null ? end.minus(Duration.ofDays(7)) : from;
		return compliance.report(start, end);
	}

}
