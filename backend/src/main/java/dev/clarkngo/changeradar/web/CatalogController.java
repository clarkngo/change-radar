package dev.clarkngo.changeradar.web;

import dev.clarkngo.changeradar.catalog.ServiceCatalog;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
class CatalogController {

	private final ServiceCatalog catalog;

	CatalogController(ServiceCatalog catalog) {
		this.catalog = catalog;
	}

	@GetMapping("/api/catalog")
	ServiceCatalog catalog() {
		return catalog;
	}

}
