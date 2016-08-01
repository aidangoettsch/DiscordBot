"use strict";
var https = require('https');
var WebSocket = require('ws');
var zlib = require("zlib");
var util = require("util");
var stream = require("stream");
var events = require('events');
var bunyan = require('bunyan');
var heartbeat = 0;
var s = 0;
var token = "";
var gatewaySocket = {};
var guilds = {};
var user = {};

function EventEmitter() {
  events.call(this);
}
util.inherits(EventEmitter, events);

var eventEmitter = new EventEmitter();

module.exports = {
  connect: connect,
  //getGateway: getGateway,
  updateStatus: updateStatus,
  sendGatewayPayload: sendGatewayPayload,
  events: eventEmitter
};

function connect(botToken) {
  token = botToken;

  gatewaySocket = new WebSocket("wss://gateway.discord.gg");

  gatewaySocket.on('open', function () {
    console.log("Connected to gateway");

    sendGatewayPayload(2, {
      token: token,
      v: 4,
      encoding: "json",
      compress: true,
      large_threshold: 250,
      properties: {
        "$os": "WontonBot",
        "$browser": "WontonBot",
        "$device": "WontonBot",
        "$referrer": "WontonBot",
        "$referring_domain": "WontonBot"
      }
    })
  });

  gatewaySocket.on('error', function (e) {
    console.error("WS Error: " + e);
    //gatewaySocket = new WebSocket(getGateway(false));
  });

  gatewaySocket.on('message', function (data) {
    processPayload(data);

    if (data instanceof Buffer) {
      try {
        data = zlib.inflateSync(data).toString();
      } catch (e) {
        console.error("Data Parse Error: " + e)
      }
    }

    data = JSON.parse(data);
    console.log(data);
  });
}

function sendGatewayPayload(op, data) {
  gatewaySocket.send(JSON.stringify({
    op: op,
    d: data
  }));
}

function sendHTTPRequest(path, method, data, cb) {
  var req = https.request({
    hostname: "discordapp.com",
    path: "/api" + path,
    method: method,
    headers: {
      'Authorization': token,
      'Content-Type': 'application/json',
      'User-Agent': 'DiscordBot (y23k.net, 0.1.0)'
    }
  }, function (res) {
    res.on('data', function (d) {
      try {
        d = JSON.parse(d.toString("utf8"));

        if (typeof cb !== 'undefined') cb(d);
      } catch (e) {
        console.log("Error parsing response: " + e)
      }
    });

    res.on('error', function (e) {
      console.error("Error sending HTTP payload: " + e)
    })
  });
  if (typeof data !== 'undefined') req.write(JSON.stringify(data));
  req.end();
}

function processPayload(data) {
  if (data instanceof Buffer) {
    try {
      data = zlib.inflateSync(data).toString();
    } catch (e) {
      console.error("Data Parse Error: " + e)
    }
  }

  data = JSON.parse(data);
  eventEmitter.emit('payload', data);

  s = data.s;

  if (data.op == 0) eventEmitter.emit('event', data.t, data.d, data)
}

eventEmitter.on('event', function (t, d, rawData) {
  switch (t) {
    case "READY":
      eventEmitter.emit('ready', d, rawData);
      break;
    case "GUILD_CREATE":
      eventEmitter.emit('guildCreate', d, rawData);
      console.log(d.roles[0]);
      break;
    case "MESSAGE_CREATE":
      eventEmitter.emit('messageCreate', d, rawData);
      break;
    case "TYPING_START":
      eventEmitter.emit('typingStart', d, rawData);
      break;
    case "PRESENCE_UPDATE":
      eventEmitter.emit('presenceUpdate', d, rawData);
      break;
    case "VOICE_STATE_UPDATE":
      eventEmitter.emit('voiceStateUpdate', d, rawData);
      break;
    case "VOICE_SERVER_UPDATE":
      eventEmitter.emit('voiceServerUpdate', d, rawData);
      break;
    default:
      console.error("Unknown event: " + t)
  }
});

eventEmitter.on('ready', function (d) {
  heartbeat = d.heartbeat_interval;
  user = d.user;
  guilds = d.guilds;
  setInterval(function () {
    try {
      sendGatewayPayload(1, s)
    } catch (e) {
      console.error("Error sending heartbeat: " + e);
    }
  }, heartbeat);
});

function updateStatus(idle, game) {
  sendGatewayPayload(3, {
    idle_since: idle,
    game: {
      name: game
    }
  });
}

connect("MTY5NjE3MzE2ODY5NDM5NDg4.CfGPaw.B15aJ15rlSKmKrbL2cncLycKhzc");