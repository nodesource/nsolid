// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

#include "opentelemetry/sdk/trace/tracer_provider.h"
#include "opentelemetry/sdk/resource/resource.h"
#include "opentelemetry/sdk/trace/samplers/always_off.h"
#include "opentelemetry/sdk/trace/samplers/always_on.h"
#include "opentelemetry/sdk/trace/simple_processor.h"
#include "opentelemetry/sdk/trace/tracer.h"

#include <gtest/gtest.h>

using namespace opentelemetry::sdk::trace;
using namespace opentelemetry::sdk::resource;

#include <iostream>

TEST(TracerProvider, GetTracer)
{
  std::unique_ptr<SpanProcessor> processor(new SimpleSpanProcessor(nullptr));
  std::vector<std::unique_ptr<SpanProcessor>> processors;
  processors.push_back(std::move(processor));
  std::unique_ptr<TracerContext> context1(
      new TracerContext(std::move(processors), Resource::Create({})));
  TracerProvider tp1(std::move(context1));
  auto t1 = tp1.GetTracer("test");
  auto t2 = tp1.GetTracer("test");
  auto t3 = tp1.GetTracer("different", "1.0.0");
  auto t4 = tp1.GetTracer("");
  auto t5 = tp1.GetTracer(opentelemetry::nostd::string_view{});
  auto t6 = tp1.GetTracer("different", "1.0.0", "https://opentelemetry.io/schemas/1.2.0");
  ASSERT_NE(nullptr, t1);
  ASSERT_NE(nullptr, t2);
  ASSERT_NE(nullptr, t3);
  ASSERT_NE(nullptr, t6);

  // Should return the same instance each time.
  ASSERT_EQ(t1, t2);
  ASSERT_NE(t1, t3);
  ASSERT_EQ(t4, t5);
  ASSERT_NE(t3, t6);

  // Should be an sdk::trace::Tracer with the processor attached.
#ifdef OPENTELEMETRY_RTTI_ENABLED
  auto sdkTracer1 = dynamic_cast<Tracer *>(t1.get());
#else
  auto sdkTracer1 = static_cast<Tracer *>(t1.get());
#endif
  ASSERT_NE(nullptr, sdkTracer1);
  ASSERT_EQ("AlwaysOnSampler", sdkTracer1->GetSampler().GetDescription());
  std::unique_ptr<SpanProcessor> processor2(new SimpleSpanProcessor(nullptr));
  std::vector<std::unique_ptr<SpanProcessor>> processors2;
  processors2.push_back(std::move(processor2));
  std::unique_ptr<TracerContext> context2(
      new TracerContext(std::move(processors2), Resource::Create({}),
                        std::unique_ptr<Sampler>(new AlwaysOffSampler()),
                        std::unique_ptr<IdGenerator>(new RandomIdGenerator)));
  TracerProvider tp2(std::move(context2));
#ifdef OPENTELEMETRY_RTTI_ENABLED
  auto sdkTracer2 = dynamic_cast<Tracer *>(tp2.GetTracer("test").get());
#else
  auto sdkTracer2 = static_cast<Tracer *>(tp2.GetTracer("test").get());
#endif
  ASSERT_EQ("AlwaysOffSampler", sdkTracer2->GetSampler().GetDescription());

  auto instrumentation_scope1 = sdkTracer1->GetInstrumentationScope();
  ASSERT_EQ(instrumentation_scope1.GetName(), "test");
  ASSERT_EQ(instrumentation_scope1.GetVersion(), "");

  // Should be an sdk::trace::Tracer with the processor attached.
#ifdef OPENTELEMETRY_RTTI_ENABLED
  auto sdkTracer3 = dynamic_cast<Tracer *>(t3.get());
#else
  auto sdkTracer3 = static_cast<Tracer *>(t3.get());
#endif
  auto instrumentation_scope3 = sdkTracer3->GetInstrumentationScope();
  ASSERT_EQ(instrumentation_scope3.GetName(), "different");
  ASSERT_EQ(instrumentation_scope3.GetVersion(), "1.0.0");
}

TEST(TracerProvider, Shutdown)
{
  std::unique_ptr<SpanProcessor> processor(new SimpleSpanProcessor(nullptr));
  std::vector<std::unique_ptr<SpanProcessor>> processors;
  processors.push_back(std::move(processor));

  std::unique_ptr<TracerContext> context1(new TracerContext(std::move(processors)));
  TracerProvider tp1(std::move(context1));

  EXPECT_TRUE(tp1.Shutdown());

  // It's safe to shutdown again
  EXPECT_TRUE(tp1.Shutdown());
}

TEST(TracerProvider, ForceFlush)
{
  std::unique_ptr<SpanProcessor> processor1(new SimpleSpanProcessor(nullptr));

  TracerProvider tp1(std::move(processor1));

  EXPECT_TRUE(tp1.ForceFlush());
}
