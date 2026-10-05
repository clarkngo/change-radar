package dev.clarkngo.changeradar.web;

import java.time.Instant;
import java.util.List;
import java.util.Set;

import dev.clarkngo.changeradar.change.ChangeEvent;
import dev.clarkngo.changeradar.change.ChangeQuery;
import dev.clarkngo.changeradar.change.ChangeSearchService;
import dev.clarkngo.changeradar.change.ChangeType;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/changes")
class ChangeController {

	record PageResponse(List<ChangeEvent> items, long total, int page, int size) {
	}

	private final ChangeSearchService search;

	ChangeController(ChangeSearchService search) {
		this.search = search;
	}

	@GetMapping
	PageResponse search(@RequestParam(required = false) String q,
			@RequestParam(required = false) Set<String> service,
			@RequestParam(required = false) Set<String> team,
			@RequestParam(required = false) Set<ChangeType> type,
			@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant from,
			@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant to,
			@RequestParam(required = false) Boolean compliant,
			@RequestParam(defaultValue = "0") @Min(0) int page,
			@RequestParam(defaultValue = "20") @Min(1) @Max(200) int size) {
		Page<ChangeEvent> result = search.search(new ChangeQuery(q, service, team, type, from, to, compliant),
				PageRequest.of(page, size));
		return new PageResponse(result.getContent(), result.getTotalElements(), page, size);
	}

}
