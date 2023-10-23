'use strict';

const common = require('../common');
const assert = require('assert');
const nsolid = require('nsolid');
const { spawn } = require('child_process');

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
      otlpConfig: 'rubbish'
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
        url: 'http://localhost:9999'
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
];

if (process.argv[2] === 'child') {
  nsolid.start();
  const test = tests[process.argv[3]];
  const { expected } = test;
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
} else {
  for (let i = 0; i < tests.length; ++i) {
    const config = tests[i].config;
    const env = {
      NSOLID_OTLP: config.otlp
    };

    if (typeof config.otlpConfig === 'string') {
      env.NSOLID_OTLP_CONFIG = config.otlpConfig;
    } else {
      env.NSOLID_OTLP_CONFIG = JSON.stringify(config.otlpConfig);
    }

    const cp = spawn(process.execPath, [ __filename, 'child', i ], { env });
    cp.on('exit', common.mustCall((code, signal) => {
      assert.strictEqual(code, 0);
      assert.strictEqual(signal, null);
    }));
  }
}
