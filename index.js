/**
 The MIT License (MIT)

 Copyright (c) 2016 @biddster

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights
 to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 copies of the Software, and to permit persons to whom the Software is
 furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in
 all copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 THE SOFTWARE.
 */
'use strict';

module.exports = function(RED) {
    const WemoEmulator = require('./lib/WemoEmulator'),
        domain = require('domain'),
        _ = require('lodash');

    // For each wemore.Emulate we create, wemore registers a process exit listener. By default, node
    // only supports 10 exit listeners and we are likely to want to emulate many more devices than that.
    // https://github.com/biddster/node-red-contrib-wemo-emulator/issues/8
    process.setMaxListeners(0);

    RED.nodes.registerType('wemo-emulator', function(config) {
        RED.nodes.createNode(this, config);
        const node = this,
            globalConfig = { debug: false };

        function getGlobalConfig() {
            return _.assign(globalConfig, node.context().global.get('wemo-emulator'));
        }

        function debug() {
            if (getGlobalConfig().debug) node.log.apply(node, arguments);
        }

        // Address in use errors occur when ports clash. They stop node dead so we use a domain to notify the user.
        // Otherwise NodeRED won't start and that's hard to debug.
        // Note that domains are deprecated in v7. So we'll have to port to whatever replaces them in the future.
        const d = domain.create();

        d.on('error', function(e) {
            node.error(`Emulation error: ${e.message}`, e);
            node.status({
                fill: 'red',
                shape: 'dot',
                text: e.message
            });
        });

        let connection = null;
        d.run(function() {
            // {friendlyName: "TV", port: 9001, serial: 'a unique id'}

            WemoEmulator.build(config.friendlyName).then(wemoEmulator => {
                this.connection = wemoEmulator;
                wemoEmulator
                    .on('listening', function() {
                        node.status({
                            fill: 'yellow',
                            shape: 'dot',
                            text: `Listen on ${this.port}`
                        });
                        debug(`Listening on: ${this.port}`);
                    })
                    .on('on', function(self, sender) {
                        node.send({
                            topic: config.onTopic,
                            payload: config.onPayload,
                            sender: sender
                        });
                        node.status({
                            fill: 'green',
                            shape: 'dot',
                            text: 'on'
                        });
                        debug('Turning on');
                    })
                    .on('off', function(self, sender) {
                        node.send({
                            topic: config.offTopic,
                            payload: config.offPayload,
                            sender: sender
                        });
                        node.status({
                            fill: 'green',
                            shape: 'circle',
                            text: 'off'
                        });
                        debug('Turning off');
                    })
                    .on('close', function(self, sender) {
                        node.status({
                            fill: 'red',
                            shape: 'circle',
                            text: 'closed'
                        });
                        debug('Closed');
                    });
            });
        });

        node.on('close', function() {
            debug('Closing connection');
            connection.close();
            debug('Closed');
        });
    });
};
