#include "gtest/gtest.h"
#include "otlp/src/otlp_common.h"

using node::nsolid::otlp::GetVendorMetricAttributes;
using node::nsolid::otlp::GetVendorMetricDimensions;
using opentelemetry::sdk::resource::Resource;
using opentelemetry::sdk::resource::ResourceAttributes;

TEST(OTLPVendorMetrics, Identity) {
  ResourceAttributes attrs{
      {"service.name", std::string("app,\"name\\\n")},
      {"service.instance.id", std::string("agent-id")},
      {"host.name", std::string("hostname")},
      {"process.pid", int64_t{42}},
      {"unrelated", std::string("ignored")},
  };
  auto resource = Resource::Create(attrs);
  auto identity = GetVendorMetricAttributes(resource);
  EXPECT_EQ(identity.size(), 4);
  EXPECT_EQ(identity["service.name"], "app,\"name\\\n");
  EXPECT_EQ(identity["service.instance.id"], "agent-id");
  EXPECT_EQ(identity["host.name"], "hostname");
  EXPECT_EQ(identity["process.pid"], 42);
  const std::string dimensions = GetVendorMetricDimensions(resource);
  EXPECT_NE(dimensions.find(",service.name=\"app,\\\"name\\\\ \""),
            std::string::npos);
  EXPECT_EQ(dimensions.find('\n'), std::string::npos);
}

TEST(OTLPVendorMetrics, SkipUnexpectedIdentityTypes) {
  ResourceAttributes attrs{
      {"service.name", int64_t{42}},
      {"service.instance.id", false},
      {"host.name", int64_t{42}},
      {"process.pid", std::string("42")},
  };
  Resource resource(attrs);
  EXPECT_TRUE(GetVendorMetricAttributes(resource).empty());
  EXPECT_TRUE(GetVendorMetricDimensions(resource).empty());
}
