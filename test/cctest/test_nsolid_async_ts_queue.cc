#include "nsolid/async_ts_queue.h"
#include "nsolid/thread_safe.h"
#include "gtest/gtest.h"
#include "node_test_fixture.h"

#include <vector>
#include <utility>
#include <memory>

using node::nsolid::AsyncTSQueue;
using node::nsolid::TSQueue;

// Test fixture for AsyncTSQueue tests
class AsyncTSQueueTest : public ::testing::Test {
 protected:
  void SetUp() override {
    loop_ = uv_default_loop();
  }

  void TearDown() override {
    // Run the event loop to process any pending events
    uv_run(loop_, UV_RUN_NOWAIT);
  }

  // Helper function to run the event loop until all events are processed
  void ProcessEvents() {
    uv_run(loop_, UV_RUN_NOWAIT);
  }

  uv_loop_t* loop_;
};

// Test basic queue operations
TEST_F(AsyncTSQueueTest, BasicOperations) {
  std::vector<int> processed_items;

  // Create a queue with a callback that stores processed items
  auto queue = AsyncTSQueue<int>::create(
      loop_,
      [&processed_items](int&& item) {
        processed_items.push_back(item);
      });

  // Enqueue items
  queue->enqueue(1);
  queue->enqueue(2);
  queue->enqueue(3);

  // Process the events (this will trigger the callback)
  ProcessEvents();

  // Verify all items were processed in the correct order
  EXPECT_EQ(processed_items.size(), 3u);
  EXPECT_EQ(processed_items[0], 1);
  EXPECT_EQ(processed_items[1], 2);
  EXPECT_EQ(processed_items[2], 3);
}

// Test enqueuing with different argument types
TEST_F(AsyncTSQueueTest, EnqueueDifferentArgTypes) {
  std::vector<std::string> processed_items;

  // Create a queue with a callback that stores processed items
  auto queue = AsyncTSQueue<std::string>::create(
      loop_,
      [&processed_items](std::string&& item) {
        processed_items.push_back(item);
      });

  // Test copy enqueue
  std::string item1 = "test1";
  queue->enqueue(item1);

  // Test move enqueue
  queue->enqueue(std::string("test2"));

  // Process the events
  ProcessEvents();

  // Verify items were processed correctly
  EXPECT_EQ(processed_items.size(), 2u);
  EXPECT_EQ(processed_items[0], "test1");
  EXPECT_EQ(processed_items[1], "test2");
}

// Test callback with additional arguments using reference captures
TEST_F(AsyncTSQueueTest, CallbackWithReferenceCapture) {
  std::vector<std::pair<int, std::string>> processed_items;
  std::string prefix = "Item: ";

  // Create a queue with a callback that takes additional arguments
  // Using a reference capture to ensure processed_items is properly updated
  auto queue = AsyncTSQueue<int>::create(
      loop_,
      [&processed_items, &prefix](int&& item) {
        processed_items.emplace_back(item, prefix + std::to_string(item));
      });

  // Enqueue items
  queue->enqueue(10);
  queue->enqueue(20);

  // Process the events
  ProcessEvents();

  // Verify items were processed with the additional arguments
  EXPECT_EQ(processed_items.size(), 2u);
  EXPECT_EQ(processed_items[0].first, 10);
  EXPECT_EQ(processed_items[0].second, "Item: 10");
  EXPECT_EQ(processed_items[1].first, 20);
  EXPECT_EQ(processed_items[1].second, "Item: 20");
}

// Test callback with additional arguments using the Args&&... forwarding
TEST_F(AsyncTSQueueTest, CallbackWithForwardedArgs) {
  std::vector<std::pair<int, std::string>> processed_items;
  std::string prefix = "Item: ";

  // Create a callback function that takes the item and additional arguments
  auto callback = [](int&& item,
                     std::vector<std::pair<int, std::string>>& items,
                     const std::string& prefix) {
    items.emplace_back(item, prefix + std::to_string(item));
  };

  // Create a queue with a callback and forward additional arguments
  auto queue = AsyncTSQueue<int>::create(
      loop_,
      callback,                    // The callback function
      std::ref(processed_items),   // Reference to vector
      std::cref(prefix));          // Const reference to string

  // Enqueue items
  queue->enqueue(30);
  queue->enqueue(40);

  // Process the events
  ProcessEvents();

  // Verify items were processed with the forwarded arguments
  EXPECT_EQ(processed_items.size(), 2u);
  EXPECT_EQ(processed_items[0].first, 30);
  EXPECT_EQ(processed_items[0].second, "Item: 30");
  EXPECT_EQ(processed_items[1].first, 40);
  EXPECT_EQ(processed_items[1].second, "Item: 40");
}

// Test forwarding different argument types (value, ref, const ref)
TEST_F(AsyncTSQueueTest, ForwardingDifferentArgTypes) {
  struct Result {
    int value;
    std::string text;
    double factor;
  };

  std::vector<Result> results;
  std::string prefix = "Value: ";
  double multiplier = 2.5;

  // Callback that uses all three types of arguments
  auto callback = [](int&& item,
                     std::vector<Result>& results,    // Reference
                     const std::string& prefix,       // Const reference
                     double multiplier) {             // Value
    results.push_back({
      item,
      prefix + std::to_string(item),
      item * multiplier
    });
  };

  // Create queue with the callback and various argument types
  auto queue = AsyncTSQueue<int>::create(
      loop_,
      callback,
      std::ref(results),   // Reference
      std::cref(prefix),   // Const reference
      multiplier);         // Value (copied)

  // Enqueue items
  queue->enqueue(5);
  queue->enqueue(10);

  // Process the events
  ProcessEvents();

  // Verify all argument types were correctly forwarded
  EXPECT_EQ(results.size(), 2u);

  // First result
  EXPECT_EQ(results[0].value, 5);
  EXPECT_EQ(results[0].text, "Value: 5");
  EXPECT_DOUBLE_EQ(results[0].factor, 12.5);  // 5 * 2.5

  // Second result
  EXPECT_EQ(results[1].value, 10);
  EXPECT_EQ(results[1].text, "Value: 10");
  EXPECT_DOUBLE_EQ(results[1].factor, 25.0);  // 10 * 2.5
}

// Test multiple enqueue operations
TEST_F(AsyncTSQueueTest, MultipleEnqueueOperations) {
  std::vector<int> processed_items;

  // Create a queue
  auto queue = AsyncTSQueue<int>::create(
      loop_,
      [&processed_items](int&& item) {
        processed_items.push_back(item);
      });

  // First batch of items
  queue->enqueue(1);
  queue->enqueue(2);

  // Process events
  ProcessEvents();

  // Verify first batch was processed
  EXPECT_EQ(processed_items.size(), 2u);
  EXPECT_EQ(processed_items[0], 1);
  EXPECT_EQ(processed_items[1], 2);

  // Second batch of items
  queue->enqueue(3);
  queue->enqueue(4);

  // Process events again
  ProcessEvents();

  // Verify second batch was also processed
  EXPECT_EQ(processed_items.size(), 4u);
  EXPECT_EQ(processed_items[2], 3);
  EXPECT_EQ(processed_items[3], 4);
}

// Test with a complex data type
struct TestData {
  int id;
  std::string name;

  bool operator==(const TestData& other) const {
    return id == other.id && name == other.name;
  }
};

TEST_F(AsyncTSQueueTest, ComplexDataType) {
  std::vector<TestData> processed_items;

  // Create a queue for the complex data type
  auto queue = AsyncTSQueue<TestData>::create(
      loop_,
      [&processed_items](TestData&& item) {
        processed_items.push_back(std::move(item));
      });

  // Enqueue complex items
  queue->enqueue(TestData{1, "one"});
  queue->enqueue(TestData{2, "two"});

  // Process events
  ProcessEvents();

  // Verify complex items were processed correctly
  EXPECT_EQ(processed_items.size(), 2u);
  EXPECT_EQ(processed_items[0], (TestData{1, "one"}));
  EXPECT_EQ(processed_items[1], (TestData{2, "two"}));
}

// Test that the get_loop method returns the correct loop
TEST_F(AsyncTSQueueTest, GetLoopMethod) {
  auto queue = AsyncTSQueue<int>::create(
      loop_,
      [](int&&) {});

  // Process events
  ProcessEvents();
}

// Test that arguments are properly forwarded to the callback
TEST_F(AsyncTSQueueTest, ArgumentForwarding) {
  std::vector<std::pair<int, std::string>> processed_items;
  std::string prefix = "Item: ";

  // Create a callback function that takes the item and additional arguments
  auto callback = [](int item,
                     std::vector<std::pair<int, std::string>>& items,
                     const std::string& prefix) {
    items.emplace_back(item, prefix + std::to_string(item));
  };

  // Create a queue with a callback and forward additional arguments
  auto queue = AsyncTSQueue<int>::create(
      loop_,
      callback,                    // The callback function
      std::ref(processed_items),   // Reference to vector
      std::cref(prefix));          // Const reference to string

  // Enqueue items
  queue->enqueue(50);
  queue->enqueue(60);

  // Process the events
  ProcessEvents();

  // Verify items were processed with the forwarded arguments
  EXPECT_EQ(processed_items.size(), 2u);
  EXPECT_EQ(processed_items[0].first, 50);
  EXPECT_EQ(processed_items[0].second, "Item: 50");
  EXPECT_EQ(processed_items[1].first, 60);
  EXPECT_EQ(processed_items[1].second, "Item: 60");
}
