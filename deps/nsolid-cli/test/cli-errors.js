var path = require('path')
var childProcess = require('child_process')
var test = require('tape')

test('no command', function (t) {
  var result = nsolidCli([])

  t.equals(result.status, 1)
  t.equals(result.stderr, 'Expecting a command: snapshot, etc. Use -h for list of commands.\n')
  t.equals(result.stdout, '')
  t.end()
})

test('too many commands', function (t) {
  var result = nsolidCli('foo bar'.split(' '))

  t.equals(result.status, 1)
  t.equals(result.stderr, 'Expecting only a single command\n')
  t.equals(result.stdout, '')
  t.end()
})

function nsolidCli (args) {
  var execOpts = {
    encoding: 'utf8'
  }

  args.unshift(path.join(__dirname, '..', 'cli-bin.js'))
  return childProcess.spawnSync('node', args, execOpts)
}
