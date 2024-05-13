'use strict';

const common = require('../common');
const assert = require('assert');
const nsolid = require('nsolid');

const DatadogKeys = [ 'zone', 'key', 'url' ];
const DynatraceKeys = [ 'site', 'token' ];
const NewRelicKeys = [ 'zone', 'key' ];
const OTLPKeys = [ 'url' ];

const tests = [
  {
    config: {
      otlp: 'rubbish'
    },
    expected: {
      otlp: undefined,
      otlpConfig: undefined
    }
  },
  {
    config: {
      otlp: 'datadog',
      otlpConfig: {
        zone: 'eu',
        key: 'my_random_key',
        url: 'http://localhost:9999',
        whatever: 'nothing'
      }
    },
    expected: {
      otlp: 'datadog',
      otlpConfig: {
        zone: 'eu',
        key: 'my_random_key',
        url: 'http://localhost:9999'
      }
    }
  },
  {
    config: {
      otlp: 'datadog',
      otlpConfig: {
        zone: 'us',
        key: 'my_random_key',
        url: 'http://localhost:9999',
      }
    },
    expected: {
      otlp: 'datadog',
      otlpConfig: {
        zone: 'us',
        key: 'my_random_key',
        url: 'http://localhost:9999'
      }
    }
  },
  {
    config: {
      otlp: 'datadog',
      otlpConfig: {
        zone: 'wr',
        key: 'my_random_key',
        url: 'http://localhost:9999',
      }
    },
    expected: {
      otlp: undefined,
      otlpConfig: undefined
    }
  },
  {
    config: {
      otlp: 'datadog',
      otlpConfig: {
        zone: 'eu',
        key: 1234,
        url: 'http://localhost:9999',
      }
    },
    expected: {
      otlp: undefined,
      otlpConfig: undefined
    }
  },
  {
    config: {
      otlp: 'datadog',
      otlpConfig: {
        zone: 'eu',
        key: 'my_random_key',
        url: 2134,
      }
    },
    expected: {
      otlp: undefined,
      otlpConfig: undefined
    }
  },
  {
    config: {
      otlp: 'datadog',
      otlpConfig: {
        zone: 'eu',
        key: 'my_random_key',
        whatever: 'nothing'
      }
    },
    expected: {
      otlp: undefined,
      otlpConfig: undefined
    }
  },
  {
    config: {
      otlp: 'datadog',
      otlpConfig: {
        zone: 'eu',
        whatever: 'nothing'
      }
    },
    expected: {
      otlp: undefined,
      otlpConfig: undefined
    }
  },
  {
    config: {
      otlp: 'datadog',
      otlpConfig: {
        whatever: 'nothing'
      }
    },
    expected: {
      otlp: undefined,
      otlpConfig: undefined
    }
  },

  {
    config: {
      otlp: 'dynatrace',
      otlpConfig: {
        site: 'my_site',
        token: 'my_token',
        whatever: 'nothing'
      }
    },
    expected: {
      otlp: 'dynatrace',
      otlpConfig: {
        site: 'my_site',
        token: 'my_token'
      }
    }
  },
  {
    config: {
      otlp: 'dynatrace',
      otlpConfig: {
        site: 'my_site',
        whatever: 'nothing'
      }
    },
    expected: {
      otlp: undefined,
      otlpConfig: undefined
    }
  },
  {
    config: {
      otlp: 'dynatrace',
      otlpConfig: {
        token: 'my_token',
        whatever: 'nothing'
      }
    },
    expected: {
      otlp: undefined,
      otlpConfig: undefined
    }
  },
  {
    config: {
      otlp: 'newrelic',
      otlpConfig: {
        zone: 'eu',
        key: 'my_random_key',
        whatever: 'nothing'
      }
    },
    expected: {
      otlp: 'newrelic',
      otlpConfig: {
        zone: 'eu',
        key: 'my_random_key',
      }
    }
  },
  {
    config: {
      otlp: 'newrelic',
      otlpConfig: {
        zone: 'us',
        key: 'my_random_key'
      }
    },
    expected: {
      otlp: 'newrelic',
      otlpConfig: {
        zone: 'us',
        key: 'my_random_key',
      }
    }
  },
  {
    config: {
      otlp: 'newrelic',
      otlpConfig: {
        zone: 'wr',
        key: 'my_random_key'
      }
    },
    expected: {
      otlp: undefined,
      otlpConfig: undefined
    }
  },
  {
    config: {
      otlp: 'newrelic',
      otlpConfig: {
        zone: 'eu',
        key: 1234,
      }
    },
    expected: {
      otlp: undefined,
      otlpConfig: undefined
    }
  },
  {
    config: {
      otlp: 'newrelic',
      otlpConfig: {
        zone: 'eu',
        whatever: 'nothing'
      }
    },
    expected: {
      otlp: undefined,
      otlpConfig: undefined
    }
  },
  {
    config: {
      otlp: 'newrelic',
      otlpConfig: {
        whatever: 'nothing'
      }
    },
    expected: {
      otlp: undefined,
      otlpConfig: undefined
    }
  },
  {
    config: {
      otlp: 'otlp'
    },
    expected: {
      otlp: undefined,
      otlpConfig: undefined
    }
  },
  {
    config: {
      otlp: 'otlp',
      otlpConfig: {
        url: 'http://localhost:9999',
        whatever: 'nothing'
      }
    },
    expected: {
      otlp: 'otlp',
      otlpConfig: {
        url: 'http://localhost:9999',
        protocol: 'http'
      }
    }
  },
  {
    config: {
      otlp: 'otlp',
      otlpConfig: {
        whatever: 'nothing'
      }
    },
    expected: {
      otlp: undefined,
      otlpConfig: undefined
    }
  },
  {
    config: {
      otlp: 'otlp',
      otlpConfig: {
        url: 1234
      }
    },
    expected: {
      otlp: undefined,
      otlpConfig: undefined
    }
  },
  {
    config: {
      otlp: 'otlp',
      otlpConfig: {
        url: 'http://localhost:9999',
        protocol: 'nothing'
      }
    },
    expected: {
      otlp: undefined,
      otlpConfig: undefined
    }
  },
  {
    config: {
      otlp: 'otlp',
      otlpConfig: {
        url: 'http://localhost:9999',
        protocol: 'http'
      }
    },
    expected: {
      otlp: 'otlp',
      otlpConfig: {
        url: 'http://localhost:9999',
        protocol: 'http'
      }
    }
  },
  {
    config: {
      otlp: 'otlp',
      otlpConfig: {
        url: 'http://localhost:9999',
        protocol: 'grpc'
      }
    },
    expected: {
      otlp: 'otlp',
      otlpConfig: {
        url: 'http://localhost:9999',
        protocol: 'grpc'
      }
    }
  },
];

function testConfig(config, expected, cb) {
  nsolid.start(config);
  setTimeout(() => {
    const { otlp, otlpConfig } = expected;
    assert.strictEqual(nsolid.config.otlp, otlp);
    if (otlpConfig) {
      Object.keys(otlpConfig).forEach((k) => {
        switch (otlp) {
          case 'datadog':
            if (!DatadogKeys.includes(k)) {
              return;
            }
            break;
          case 'dynatrace':
            if (!DynatraceKeys.includes(k)) {
              return;
            }
            break;
          case 'newrelic':
            if (!NewRelicKeys.includes(k)) {
              return;
            }
            break;
          case 'otlp':
            if (!OTLPKeys.includes(k)) {
              return;
            }
            break;
        }
        assert.strictEqual(nsolid.config.otlpConfig[k], otlpConfig[k]);
      });
    } else {
      assert.strictEqual(nsolid.config.otlpConfig, undefined);
    }
    cb();
  }, 10);
}

function runTests(tests, index, cb) {
  const test = tests[index];
  if (test) {
    testConfig(test.config, test.expected, () => {
      runTests(tests, ++index, cb);
    });
  } else {
    cb();
  }
}

runTests(tests, 0, common.mustCall());
