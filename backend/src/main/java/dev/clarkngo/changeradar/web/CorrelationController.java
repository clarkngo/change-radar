package dev.clarkngo.changeradar.web;

import java.time.Instant;

import dev.clarkngo.changeradar.correlate.CorrelationResult;
import dev.clarkngo.changeradar.correlate.CorrelationService;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
class CorrelationController {

	private final CorrelationService correlation;

	CorrelationController(CorrelationService correlation) {
		this.correlation = correlation;
	}

	/** Example: {@code GET /api/correlate?service=ads-serving&at=2026-10-05T21:30:00Z} */
	@GetMapping("/api/correlate")
	CorrelationResult correlate(@RequestParam @NotBlank String service,
			@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant at,
			@RequestParam(defaultValue = "" + CorrelationService.DEFAULT_WINDOW_MINUTES) @Min(5) @Max(1440) int windowMinutes) {
		return correlation.correlate(service, at == null ? Instant.now() : at, windowMinutes);
	}

}
