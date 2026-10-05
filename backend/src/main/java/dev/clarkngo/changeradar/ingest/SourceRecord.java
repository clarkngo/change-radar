package dev.clarkngo.changeradar.ingest;

import dev.clarkngo.changeradar.catalog.ServiceCatalog;
import dev.clarkngo.changeradar.change.ChangeEvent;

/** A raw record in its source's own shape, which knows how to normalize itself. */
public interface SourceRecord {

	/** Returns the normalized change, or {@code null} to skip this record (e.g. a non-production deploy). */
	ChangeEvent normalize(ServiceCatalog catalog);

}
