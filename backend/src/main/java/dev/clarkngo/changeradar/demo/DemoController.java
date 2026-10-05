package dev.clarkngo.changeradar.demo;

import java.util.List;

import org.springframework.context.annotation.Profile;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Profile("demo")
class DemoController {

	private final DemoData data;

	DemoController(DemoData data) {
		this.data = data;
	}

	/** The planted incidents, so the UI can offer "investigate this alert" shortcuts. */
	@GetMapping("/api/demo/scenarios")
	List<DemoData.Scenario> scenarios() {
		return data.scenarios();
	}

}
