const path = require('path');
const { exec } = require('child_process');
const { watch } = require('chokidar');
const WebSocket = require('ws');
const express = require('express');
const opn = require('opn');
const argv = require('yargs-parser')(process.argv.slice(2), {
  boolean: ['open'],
  default: { open: true }
});

if (argv._.length < 1) {
  console.error('usage: lovr-webvr-server [--port <port>] project');
  process.exit(1);
}

const source = argv._[0];
const project = path.basename(source);
const port = argv.port || 8080;
const open = argv.open;

let updated = false;

const compile = (req, res, next) => {
  if (updated) return next();

  updated = true;

  const command = [
    'python',
    path.join(__dirname, 'emscripten/tools/file_packager.py'),
    path.join(__dirname, 'build', `${project}.data`),
    '--preload ' + path.resolve(source) + '@/',
    '--js-output=' + path.join(__dirname, 'build', `${project}.js`)
  ].join(' ');

  exec(command, (error, stdout, stderr) => {
    if (error) {
      console.error(stderr);
      updated = false;
      return next();
    }

    compile(req, res, next)
  });
};

const refresh = () => {
  connections.forEach(connection => {
    if (connection.readyState === WebSocket.OPEN) {
      connection.send('refresh');
    }
  });
};

watch(source).on('all', () => {
  if (updated) {
    updated = false;
    compile(null, null, refresh);
  }
});

const socketServer = new WebSocket.Server({ port: 8081 });
let connections = [];
socketServer.on('connection', connection => {
  connections.push(connection);
  connection.on('close', () => connections.splice(connections.indexOf(connection)));
});

express().
  set('view engine', 'ejs').
  use(express.static('build')).
  get('/', compile, (req, res) => res.render('index', { project })).
  listen(port, function() {
    const address = this.address();
    console.log(`Listening on ${address.port}`);
    open && opn(`http://localhost:${address.port}`);
  });
