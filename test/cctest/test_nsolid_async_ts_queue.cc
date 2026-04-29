#include "nsolid/async_ts_queue.h"
#include "nsolid/thread_safe.h"
#include "gtest/gtest.h"
#include "node_test_fixture.h"

#include <vector>
#include <utility>
#include <memory>
// NOLINTNEXTLINE(build/c++11)
#include <chrono>
// NOLINTNEXTLINE(build/c++11)
#include <condition_variable>
// NOLINTNEXTLINE(build/c++11)
#include <mutex>
// NOLINTNEXTLINE(build/c++11)
#include <thread>

using std::chrono_literals::operator""ms;

using node::nsolid::AsyncTSQueue;
using node::nsolid::TSQueue;

// Test fixture for AsyncTSQueue tests
class AsyncTSQueueTest : public ::testing::Test {
 protected:
  void SetUp() override {
    uv_loop_init(&loop_);
    loop_thread_ = std::thread([&] {
      uv_async_init(&loop_, &stop_handle_, [](uv_async_t* handle) {
        uv_close(reinterpret_cast<uv_handle_t*>(handle), nullptr);
      });

      uv_run(&loop_, UV_RUN_DEFAULT);
    });
  }

  void TearDown() override {
    // Stop the loop thread
    uv_async_send(&stop_handle_);
    loop_thread_.join();
    ASSERT_EQ(0, uv_loop_close(&loop_));
  }

  uv_loop_t loop_;
  std::thread loop_thread_;
  uv_async_t stop_handle_;
};

// Test basic queue operations
TEST_F(AsyncTSQueueTest, BasicOperations) {
  std::vector<int> processed_items;
  std::condition_variable cv;
  std::mutex mtx;

  // Create a queue with a callback that stores processed items
  auto queue = AsyncTSQueue<int>::create(
      &loop_,
      [&processed_items, &cv, &mtx](int&& item) {
        std::lock_guard<std::mutex> lock(mtx);
        processed_items.push_back(item);
        cv.notify_one();
      });

  // Enqueue items
  queue->enqueue(1);
  queue->enqueue(2);
  queue->enqueue(3);

  // Wait for all items to be processed
  {
    std::unique_lock<std::mutex> lock(mtx);
    cv.wait(lock, [&] { return processed_items.size() == 3; });
  }

  // Verify all items were processed in the correct order
  EXPECT_EQ(processed_items.size(), 3u);
  EXPECT_EQ(processed_items[0], 1);
  EXPECT_EQ(processed_items[1], 2);
  EXPECT_EQ(processed_items[2], 3);
}

// Test enqueuing with different argument types
TEST_F(AsyncTSQueueTest, EnqueueDifferentArgTypes) {
  std::vector<std::string> processed_items;
  std::condition_variable cv;
  std::mutex mtx;

  // Create a queue with a callback that stores processed items
  auto queue = AsyncTSQueue<std::string>::create(
      &loop_,
      [&processed_items, &cv, &mtx](std::string&& item) {
        std::lock_guard<std::mutex> lock(mtx);
        processed_items.push_back(item);
        cv.notify_one();
      });

  // Test copy enqueue
  std::string item1 = "test1";
  queue->enqueue(item1);

  // Test move enqueue
  queue->enqueue(std::string("test2"));

  // Wait for all items to be processed
  {
    std::unique_lock<std::mutex> lock(mtx);
    cv.wait(lock, [&] { return processed_items.size() == 2; });
  }

  // Verify items were processed correctly
  EXPECT_EQ(processed_items.size(), 2u);
  EXPECT_EQ(processed_items[0], "test1");
  EXPECT_EQ(processed_items[1], "test2");
}

// // Test callback with additional arguments using reference captures
TEST_F(AsyncTSQueueTest, CallbackWithReferenceCapture) {
  std::vector<std::pair<int, std::string>> processed_items;
  std::string prefix = "Item: ";
  std::condition_variable cv;
  std::mutex mtx;

  // Create a queue with a callback that takes additional arguments
  // Using a reference capture to ensure processed_items is properly updated
  auto queue = AsyncTSQueue<int>::create(
      &loop_,
      [&processed_items, &prefix, &cv, &mtx](int&& item) {
        std::lock_guard<std::mutex> lock(mtx);
        processed_items.emplace_back(item, prefix + std::to_string(item));
        cv.notify_one();
      });

  // Enqueue items
  queue->enqueue(10);
  queue->enqueue(20);

  // Wait for all items to be processed
  {
    std::unique_lock<std::mutex> lock(mtx);
    cv.wait(lock, [&] { return processed_items.size() == 2; });
  }

  // Verify items were processed with the additional arguments
  EXPECT_EQ(processed_items.size(), 2u);
  EXPECT_EQ(processed_items[0].first, 10);
  EXPECT_EQ(processed_items[0].second, "Item: 10");
  EXPECT_EQ(processed_items[1].first, 20);
  EXPECT_EQ(processed_items[1].second, "Item: 20");
}

// // Test callback with additional arguments using the Args&&... forwarding
TEST_F(AsyncTSQueueTest, CallbackWithForwardedArgs) {
  std::vector<std::pair<int, std::string>> processed_items;
  std::string prefix = "Item: ";
  std::condition_variable cv;
  std::mutex mtx;

  // Create a callback function that takes the item and additional arguments
  auto callback = [&](int&& item,
                     std::vector<std::pair<int, std::string>>& items,
                     const std::string& prefix) {
    std::lock_guard<std::mutex> lock(mtx);
    items.emplace_back(item, prefix + std::to_string(item));
    cv.notify_one();
  };

  // Create a queue with a callback and forward additional arguments
  auto queue = AsyncTSQueue<int>::create(
      &loop_,
      callback,                    // The callback function
      std::ref(processed_items),   // Reference to vector
      std::cref(prefix));          // Const reference to string

  // Enqueue items
  queue->enqueue(30);
  queue->enqueue(40);

  // Wait for all items to be processed
  {
    std::unique_lock<std::mutex> lock(mtx);
    cv.wait(lock, [&] { return processed_items.size() == 2; });
  }

  // Verify items were processed with the forwarded arguments
  EXPECT_EQ(processed_items.size(), 2u);
  EXPECT_EQ(processed_items[0].first, 30);
  EXPECT_EQ(processed_items[0].second, "Item: 30");
  EXPECT_EQ(processed_items[1].first, 40);
  EXPECT_EQ(processed_items[1].second, "Item: 40");
}

// // Test forwarding different argument types (value, ref, const ref)
TEST_F(AsyncTSQueueTest, ForwardingDifferentArgTypes) {
  struct Result {
    int value;
    std::string text;
    double factor;
  };

  std::vector<Result> results;
  std::string prefix = "Value: ";
  double multiplier = 2.5;
  std::condition_variable cv;
  std::mutex mtx;

  // Callback that uses all three types of arguments
  auto callback = [&](int&& item,
                      std::vector<Result>& results,    // Reference
                      const std::string& prefix,       // Const reference
                      double multiplier) {             // Value
    std::lock_guard<std::mutex> lock(mtx);
    results.push_back({
      item,
      prefix + std::to_string(item),
      item * multiplier
    });
    cv.notify_one();
  };

  // Create queue with the callback and various argument types
  auto queue = AsyncTSQueue<int>::create(
      &loop_,
      callback,
      std::ref(results),   // Reference
      std::cref(prefix),   // Const reference
      multiplier);         // Value (copied)

  // Enqueue items
  queue->enqueue(5);
  queue->enqueue(10);

  // Wait for all items to be processed
  {
    std::unique_lock<std::mutex> lock(mtx);
    cv.wait(lock, [&] { return results.size() == 2; });
  }

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

// // Test multiple enqueue operations
TEST_F(AsyncTSQueueTest, MultipleEnqueueOperations) {
  std::vector<int> processed_items;
  std::condition_variable cv;
  std::mutex mtx;

  // Create a queue
  auto queue = AsyncTSQueue<int>::create(
      &loop_,
      [&processed_items, &cv, &mtx](int&& item) {
        std::lock_guard<std::mutex> lock(mtx);
        processed_items.push_back(item);
        cv.notify_one();
      });

  // First batch of items
  queue->enqueue(1);
  queue->enqueue(2);

  // Wait for first batch to be processed
  {
    std::unique_lock<std::mutex> lock(mtx);
    cv.wait(lock, [&] { return processed_items.size() == 2; });
  }

  // Verify first batch was processed
  EXPECT_EQ(processed_items.size(), 2u);
  EXPECT_EQ(processed_items[0], 1);
  EXPECT_EQ(processed_items[1], 2);

  // Second batch of items
  queue->enqueue(3);
  queue->enqueue(4);

  // Wait for second batch to be processed
  {
    std::unique_lock<std::mutex> lock(mtx);
    cv.wait(lock, [&] { return processed_items.size() == 4; });
  }

  // Verify second batch was also processed
  EXPECT_EQ(processed_items.size(), 4u);
  EXPECT_EQ(processed_items[2], 3);
  EXPECT_EQ(processed_items[3], 4);
}

// // Test batch callback with std::vector<T>&&
TEST_F(AsyncTSQueueTest, BatchCallbackRvalueVector) {
  std::vector<int> batch_processed;
  int call_count = 0;
  std::condition_variable cv;
  std::mutex mtx;
  auto queue = AsyncTSQueue<int>::create(
      &loop_,
      [&batch_processed, &call_count, &cv, &mtx](std::vector<int>&& batch) {
        std::lock_guard<std::mutex> lock(mtx);
        ++call_count;
        batch_processed = std::move(batch);
        cv.notify_one();
      });
  queue->enqueue(10);
  queue->enqueue(20);
  queue->enqueue(30);
  {
    std::unique_lock<std::mutex> lock(mtx);
    cv.wait(lock, [&] { return call_count == 1; });
  }

  ASSERT_EQ(batch_processed.size(), 3u);
  EXPECT_EQ(batch_processed[0], 10);
  EXPECT_EQ(batch_processed[1], 20);
  EXPECT_EQ(batch_processed[2], 30);
}

// // Test batch callback with extra argument
TEST_F(AsyncTSQueueTest, BatchCallbackWithExtraArg) {
  std::vector<std::string> batch_processed;
  std::string context = "CTX";
  std::condition_variable cv;
  std::mutex mtx;
  auto queue = AsyncTSQueue<std::string>::create(
    &loop_,
    [&batch_processed, &cv, &mtx](std::vector<std::string>&& batch,
                                  const std::string& ctx) {
      std::lock_guard<std::mutex> lock(mtx);
      for (auto& item : batch) batch_processed.push_back(ctx + ":" + item);
      cv.notify_one();
    },
    std::cref(context));
  queue->enqueue("a");
  queue->enqueue("b");
  queue->enqueue("c");
  {
    std::unique_lock<std::mutex> lock(mtx);
    cv.wait(lock, [&] { return batch_processed.size() == 3; });
  }
  ASSERT_EQ(batch_processed.size(), 3u);
  EXPECT_EQ(batch_processed[0], "CTX:a");
  EXPECT_EQ(batch_processed[1], "CTX:b");
  EXPECT_EQ(batch_processed[2], "CTX:c");
}

// // Test batch callback with const std::vector<T>&
TEST_F(AsyncTSQueueTest, BatchCallbackConstVector) {
  std::vector<int> batch_processed;
  std::condition_variable cv;
  std::mutex mtx;
  auto queue = AsyncTSQueue<int>::create(
      &loop_,
      [&batch_processed, &cv, &mtx](const std::vector<int>& batch) {
        std::lock_guard<std::mutex> lock(mtx);
        batch_processed = batch;
        cv.notify_one();
      });
  queue->enqueue(5);
  queue->enqueue(7);
  queue->enqueue(9);
  {
    std::unique_lock<std::mutex> lock(mtx);
    cv.wait(lock, [&] { return batch_processed.size() == 3; });
  }
  ASSERT_EQ(batch_processed.size(), 3u);
  EXPECT_EQ(batch_processed[0], 5);
  EXPECT_EQ(batch_processed[1], 7);
  EXPECT_EQ(batch_processed[2], 9);
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
  std::condition_variable cv;
  std::mutex mtx;

  // Create a queue for the complex data type
  auto queue = AsyncTSQueue<TestData>::create(
      &loop_,
      [&processed_items, &cv, &mtx](TestData&& item) {
        std::lock_guard<std::mutex> lock(mtx);
        processed_items.push_back(std::move(item));
        cv.notify_one();
      });

  // Enqueue complex items
  queue->enqueue(TestData{1, "one"});
  queue->enqueue(TestData{2, "two"});

  {
    std::unique_lock<std::mutex> lock(mtx);
    cv.wait(lock, [&] { return processed_items.size() == 2; });
  }

  // Verify complex items were processed correctly
  EXPECT_EQ(processed_items.size(), 2u);
  EXPECT_EQ(processed_items[0], (TestData{1, "one"}));
  EXPECT_EQ(processed_items[1], (TestData{2, "two"}));
}

// // Test that arguments are properly forwarded to the callback
TEST_F(AsyncTSQueueTest, ArgumentForwarding) {
  std::vector<std::pair<int, std::string>> processed_items;
  std::string prefix = "Item: ";
  std::condition_variable cv;
  std::mutex mtx;

  // Create a callback function that takes the item and additional arguments
  auto callback = [&cv, &mtx, &processed_items](
      int item,
      std::vector<std::pair<int, std::string>>& items,
      const std::string& prefix) {
    std::lock_guard<std::mutex> lock(mtx);
    items.emplace_back(item, prefix + std::to_string(item));
    cv.notify_one();
  };

  // Create a queue with a callback and forward additional arguments
  auto queue = AsyncTSQueue<int>::create(
      &loop_,
      callback,                    // The callback function
      std::ref(processed_items),   // Reference to vector
      std::cref(prefix));          // Const reference to string

  // Enqueue items
  queue->enqueue(50);
  queue->enqueue(60);

  // Wait for all items to be processed
  {
    std::unique_lock<std::mutex> lock(mtx);
    cv.wait(lock, [&] { return processed_items.size() == 2; });
  }

  // Verify items were processed with the forwarded arguments
  EXPECT_EQ(processed_items.size(), 2u);
  EXPECT_EQ(processed_items[0].first, 50);
  EXPECT_EQ(processed_items[0].second, "Item: 50");
  EXPECT_EQ(processed_items[1].first, 60);
  EXPECT_EQ(processed_items[1].second, "Item: 60");
}

TEST_F(AsyncTSQueueTest, BatchingByMinSize) {
  std::vector<int> processed;
  std::mutex mtx;
  std::condition_variable cv;
  int batch_count = 0;
  // min_size=3, max_time=1s
  const node::nsolid::AsyncTSQueueOptions opts{3, 1000};
  auto queue = AsyncTSQueue<int>::create(&loop_,
                                         opts,
                                         [&](std::vector<int>&& batch) {
    std::lock_guard<std::mutex> lk(mtx);
    processed.insert(processed.end(), batch.begin(), batch.end());
    batch_count++;
    cv.notify_one();
  });
  queue->enqueue(1);
  queue->enqueue(2);
  // Should not trigger yet
  {
    std::unique_lock<std::mutex> lock(mtx);
    cv.wait_for(lock, 100ms, [&] { return processed.size() == 2; });
  }

  EXPECT_EQ(processed.size(), 0u);

  queue->enqueue(3);
  // Should trigger batch
  {
    std::unique_lock<std::mutex> lk(mtx);
    cv.wait_for(lk, 2000ms, [&] { return processed.size() == 3; });
  }

  EXPECT_EQ(processed.size(), 3u);
  EXPECT_EQ(processed, (std::vector<int>{1, 2, 3}));
  EXPECT_EQ(batch_count, 1);
}

TEST_F(AsyncTSQueueTest, BatchingByMaxTime) {
  std::vector<int> processed;
  std::mutex mtx;
  std::condition_variable cv;
  // min_size=5, max_time=50ms
  const node::nsolid::AsyncTSQueueOptions opts{5, 50};

  auto queue = AsyncTSQueue<int>::create(&loop_,
                                         opts,
                                         [&](std::vector<int>&& batch) {
    std::lock_guard<std::mutex> lk(mtx);
    processed.insert(processed.end(), batch.begin(), batch.end());
    cv.notify_one();
  });

  queue->enqueue(1);
  queue->enqueue(2);

  {
    std::unique_lock<std::mutex> lk(mtx);
    cv.wait_for(lk, 200ms, [&] { return processed.size() == 2; });
  }

  EXPECT_EQ(processed, (std::vector<int>{1, 2}));
}

TEST_F(AsyncTSQueueTest, BatchingBothTriggers) {
  std::vector<int> processed;
  std::mutex mtx;
  std::condition_variable cv;
  int batch_count = 0;
  // min_size=3, max_time=100ms
  const node::nsolid::AsyncTSQueueOptions opts{3, 100};
  auto queue = AsyncTSQueue<int>::create(&loop_,
                                         opts,
                                         [&](std::vector<int>&& batch) {
    std::lock_guard<std::mutex> lk(mtx);
    processed.insert(processed.end(), batch.begin(), batch.end());
    batch_count++;
    cv.notify_one();
  });

  // Enqueue slowly, timer should trigger
  queue->enqueue(1);
  std::this_thread::sleep_for(300ms);
  queue->enqueue(2);
  std::this_thread::sleep_for(300ms);
  queue->enqueue(3);

  {
    std::unique_lock<std::mutex> lk(mtx);
    cv.wait_for(lk, 1000ms, [&] { return processed.size() == 3; });
  }

  EXPECT_EQ(processed.size(), 3u);
  EXPECT_EQ(processed, (std::vector<int>{1, 2, 3}));
  EXPECT_EQ(batch_count, 3);

  // Now enqueue burst, should trigger by min_size
  processed.clear();
  batch_count = 0;
  auto queue2 = AsyncTSQueue<int>::create(&loop_,
                                          opts,
                                          [&](std::vector<int>&& batch) {
    std::lock_guard<std::mutex> lk(mtx);
    processed.insert(processed.end(), batch.begin(), batch.end());
    batch_count++;
    cv.notify_one();
  });

  queue2->enqueue(4);
  queue2->enqueue(5);
  queue2->enqueue(6);
  {
    std::unique_lock<std::mutex> lk(mtx);
    cv.wait_for(lk, 500ms, [&] { return processed.size() == 3; });
  }

  EXPECT_EQ(processed.size(), 3u);
  EXPECT_EQ(processed, (std::vector<int>{4, 5, 6}));
  EXPECT_EQ(batch_count, 1);
}


TEST_F(AsyncTSQueueTest, NoUnboundedTimerWakeupWhenEmpty) {
  std::vector<int> processed;
  std::mutex mtx;
  std::condition_variable cv;
  int call_count = 0;
  // min_size=2, max_time=30ms
  const node::nsolid::AsyncTSQueueOptions opts{2, 30};
  auto queue = AsyncTSQueue<int>::create(&loop_,
                                         opts,
                                         [&](std::vector<int>&& batch) {
    std::lock_guard<std::mutex> lk(mtx);
    processed.insert(processed.end(), batch.begin(), batch.end());
    call_count++;
    cv.notify_one();
  });

  queue->enqueue(1);
  {
    std::unique_lock<std::mutex> lk(mtx);
    cv.wait_for(lk, 500ms, [&] { return processed.size() == 1; });
  }
  EXPECT_EQ(call_count, 1);

  // Wait another timer interval, should not call again
  // (re-arm timer and run loop again to check for spurious wakeups)
  processed.clear();
  call_count = 0;

  {
    std::unique_lock<std::mutex> lk(mtx);
    cv.wait_for(lk, 500ms, [&] { return call_count > 0; });
  }

  EXPECT_EQ(processed.size(), 0);
  EXPECT_EQ(call_count, 0);
}


TEST_F(AsyncTSQueueTest, ThreadSafetyBatching) {
  std::vector<int> processed;
  std::mutex mtx;
  std::condition_variable cv;
  const node::nsolid::AsyncTSQueueOptions opts{10, 500};
  auto queue = AsyncTSQueue<int>::create(&loop_,
                                         opts,
                                         [&](std::vector<int>&& batch) {
    std::lock_guard<std::mutex> lk(mtx);
    processed.insert(processed.end(), batch.begin(), batch.end());
    cv.notify_one();
  });
  std::vector<std::thread> threads;
  for (int i = 0; i < 10; ++i) {
    threads.emplace_back([&, i] { queue->enqueue(i); });
  }
  for (auto& t : threads) t.join();
  // Wait for batch
  {
    std::unique_lock<std::mutex> lk(mtx);
    cv.wait_for(lk, 1000ms, [&] { return processed.size() == 10; });
  }
  EXPECT_EQ(processed.size(), 10u);
  std::sort(processed.begin(), processed.end());
  for (int i = 0; i < 10; ++i) EXPECT_EQ(processed[i], i);
}
