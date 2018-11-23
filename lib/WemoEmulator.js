const {UPnpBroadcastResponder, MeWoDevice} = require('mewo');
const util = require('util');
const {EventEmitter} = require('events');
const network = require('network');
const render = require('../node_modules/mewo/src/templating');
const dgram = require('dgram');


const GET_BINARY_STATE = /\<u:GetBinaryState xmlns:u="urn:Belkin:service:basicevent:1"\>\<BinaryState>([\d])\<\/BinaryState\>/;
const SET_BINARY_STATE = /\<u:SetBinaryState xmlns:u="urn:Belkin:service:basicevent:1"\>\<BinaryState>([\d])\<\/BinaryState\>/;

class Broadcaster extends UPnpBroadcastResponder {

    init({port = 1900, multicastAddress = '239.255.255.25', ipAddress = '0.0.0.0'} = {}) {
        return new Promise((resolve) => {
            this.address = ipAddress;
            const socket = dgram.createSocket({
                type: 'udp4',
                reuseAddr: true
            });
            socket.on('message', this.messageHandler.bind(this));
            socket.bind(port, () => {
                socket.addMembership(multicastAddress);
                console.log(`Server listening on port ${port}`);
                this.socket = socket;
                resolve();
            });
        });
    }

    registerDevice(device) {
      if (device instanceof WemoEmulator) {
        device.initServer(this.address).then(() => {
          this.devices.push(device);
          console.log(`Device ${device.name} [${device.serial}] registered`);
        });
      } else {
        throw new Error('Cannot add non-upnp device');
      }
    }

    close(){
        this.socket.close();
    }
}

util.inherits(MeWoDevice, EventEmitter);


class WemoEmulator extends MeWoDevice{

    constructor(name, responder, initialState = false, deviceOptions = {}) {
        super(name, responder);
        this.state = initialState;
        this.emit('listening');
    }

    /**
     * Handles a non-discover request
     */
    handleRequest(body, res) {
        const setStateMatch = body.match(SET_BINARY_STATE);
        const getStateMatch = body.match(GET_BINARY_STATE);
        if (setStateMatch) {
            this.emit(setStateMatch[1] === '1' ? 'on' : 'off', this);
        } else if (getStateMatch) {
            this.stateResponse(res, this.state)
        }
    }

    close() {
        this.responder.close();
        this.emit('closed');
        this.removeAllListeners();
    };

    getActiveNetworkInterface() {
        return new Promise((resolve, reject) => {
            network.get_active_interface((err, obj) => {
                if (err) {
                    reject(err)
                } else {
                    /*
                    { name: 'eth0',
                      ip_address: '10.0.1.3',
                      mac_address: '56:e5:f9:e4:38:1d',
                      type: 'Wired',
                      netmask: '255.255.255.0',
                      gateway_ip: '10.0.1.1' }
                    */
                    resolve(obj)
                }
            })
        });
    }

    /**
     * Sends the response for GetBinaryState
     */
    stateResponse(res, state) {
        this.log('Responding with state information');
        res.writeHead(200, {
            'Content-Type': 'xml',
            'Server': this.responder.getVersion(),
            'X-User-Agent': 'redsonic',
            'Connection': 'close'
        });
        render('get-binary-state', {state: state ? '1' : '0'})
            .then(data => {
                res.write(data);
                res.end();
            }).catch(err => {
            this.error('There was an error rendering the discovery template', err);
        });
    }
}

module.exports = {
    build: (name, options = {}) => {
        const responder = new Broadcaster();
        return responder.init(Object.assign({
            port: 1900,
            multicastAddress: '239.255.255.250',
            ipAddress: '0.0.0.0'
        }, options)).then(() => {
            // Create he new device with a name that will show up in the Alexa app
            const emulator = new WemoEmulator(name, responder);
            responder.registerDevice(emulator);
            return emulator;
        });
    }
};
