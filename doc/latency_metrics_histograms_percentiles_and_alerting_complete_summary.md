# Latency Metrics with OpenTelemetry, Histograms, and VictoriaMetrics

This document is a consolidated, end-to-end summary of how to measure, aggregate, visualize, and alert on HTTP latency using OpenTelemetry, histograms, and VictoriaMetrics (VM). It captures both _what to do_ and _why it works_.

***

## 1. What problem we are solving

We want to understand **latency distributions** (p50, p90, p99, p999) for HTTP routes in a scalable, mathematically correct way, across:

* many requests
* many service instances
* long periods of time

Raw latency samples do not scale. Precomputed percentiles do not aggregate correctly. Histograms are the correct abstraction.

***

## 2. Correct metric type: Histogram

### Why histograms

* Percentiles are _not mergeable_
* Histograms _are mergeable_
* Histograms preserve distribution shape in bounded form

### What to record in the service

* **Metric type:** Histogram
* **Value:** latency per request
* **Unit:** milliseconds (`ms`) or seconds (`s`)
* **Instrument:** `http.server.request.duration`

### Attributes (labels)

Use **low-cardinality** attributes only:

* `http.method`
* `http.route` (template, never raw URL)
* `http.status_code`

Avoid raw paths or user IDs.

***

## 3. How histograms become percentiles

### What a histogram contains

* `count`: number of requests
* `sum`: total latency
* `buckets`: cumulative counts up to boundaries

Histograms **do not store exact values**, only counts per range.

### Percentile calculation

1. Compute rank (e.g. p99 = 0.99 × count)
2. Find the bucket containing that rank
3. Interpolate inside the bucket

This produces an **estimate**, not an exact value.

### Precision tradeoff

Precision loss is:

* bounded
* predictable
* controlled by bucket design

Better buckets = better percentiles.

***

## 4. Bucket design (classic histograms)

For HTTP latency (milliseconds), a good general-purpose layout:

```
1, 2, 5, 10, 20, 50,
100, 150, 200, 300,
500, 750, 1000,
1500, 2000, 3000, 5000
```

Principles:

* Dense around SLO thresholds
* Gradually widening buckets
* Explicit tail coverage

Bad buckets lead to meaningless p99s.

***

## 5. Exponential histograms (conceptual)

Exponential histograms:

* Use logarithmic bucket growth
* Have **relative error bounds**
* Are ideal for latency distributions

However:

* VictoriaMetrics does **not yet** support querying them natively
* Today, they must be converted to classic histograms

Instrumentation should still be future-proof.

***

## 6. Role of each component

### Application (SDK)

* Records latency observations
* Maintains local histograms
* Exports aggregated data

### OpenTelemetry Collector

* Receives OTLP metrics
* Aggregates histograms across instances
* Converts OTel histograms → Prometheus histograms
* Exports via `remote_write`

The collector **does not compute percentiles**.

### VictoriaMetrics

* Stores histogram time series
* Computes percentiles at **query time**
* Aggregates across instances and time

Percentiles live at the very end of the pipeline.

***

## 7. Graphing percentiles: resolution vs window

### Key distinction

* **Step (resolution):** how often a point is drawn (e.g. 5s)
* **Window:** how much data is used to compute that point

A graph point is always a **summary over a window**, never an instant.

### Standard practice for p99 graphs

* Step: 5–30s
* Window: 5–15 minutes

Example:

```
histogram_quantile(
  0.99,
  sum by (le) (
    rate(http_server_request_duration_bucket[10m])
  )
)
```

Interpretation:

> Each dot shows the p99 latency over the previous 10 minutes.

***

## 8. Low-traffic endpoints: what changes

### The core issue

Percentiles need samples.

Rules of thumb:

* p99 needs \~100 requests
* p999 needs \~1,000 requests

Low traffic breaks percentile assumptions.

### What happens if ignored

* p99 collapses into max latency
* Graphs become noisy and misleading
* Alerts become useless

### Standard adaptations

1. **Increase window size**
   * 30–60 minutes or more

2. **Lower the percentile**
   * p95 or p90 instead of p99

3. **Use max + request count**
   * Often more honest for sparse traffic

Percentiles describe crowds. Low traffic has no crowd.

***

## 9. Dashboards vs alerts (window tuning)

### Dashboards

Purpose: understanding and trends

* Window: 5–15 minutes
* Smooth, stable lines
* Tolerates delay

### Alerts

Purpose: fast detection of user impact

* Window: 1–3 minutes
* More reactive
* Accepts some noise

Same metric, different intent.

***

## 10. Why p99 alerts should differ from p99 graphs

* Dashboard p99 explains behavior
* Alert p99 detects sudden regressions

Using dashboard windows for alerts:

* Alerts fire too late or never

Using alert windows for dashboards:

* Graphs look chaotic and lose trust

Healthy split:

* p99 dashboards: long windows
* p99 alerts: short windows

***

## 11. Percentiles vs SLI / SLO burn rates

### Percentiles

Answer:

> How slow are the slowest requests?

Good for:

* Visualization
* Debugging
* Performance analysis

### SLO burn rates

Answer:

> How fast are we spending our error budget?

Properties:

* Traffic-aware
* Directly tied to user promises
* Computed over multiple windows

### Typical burn-rate setup

* Fast burn: 5–10 minutes (paging)
* Slow burn: 30 minutes – hours (tickets)

***

## 12. Recommended mature setup

### Dashboards

* p50 / p90 / p99
* Route-level views
* 5–15 minute windows

### Alerts

* Primary: SLO burn rates
* Secondary: short-window p99 spike alerts

### Low-traffic endpoints

* No p99 alerts
* p90, max, or traces instead

***

## 13. Final mental models

* Histograms are _mergeable memory_, not raw data
* Graph points are summaries, not instants
* Percentiles describe populations, not individuals
* p99 shows shape, burn rate decides urgency

Or simply:

* **Dashboards** explain
* **p99 alerts** warn
* **Burn rates** wake people up

***

## 14. Safe upgrade path

Today:

* Classic histograms
* Collector conversion
* VM percentile queries

Tomorrow:

* Native exponential histograms
* Better precision
* Same instrumentation

No rework required.

***

End of summary.
