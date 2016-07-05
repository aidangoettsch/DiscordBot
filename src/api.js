"use strict";
var https = require('https');
var WebSocket = require('ws');
var zlib = require("zlib");
var udp = require('dgram');
var util = require("util");
var stream = require("stream");
var events = require('events');
var Opus = require('node-opus');
var nacl = require('tweetnacl');
var bunyan = require('bunyan');
var cache = require("./cache.js");
var heartbeat = 0;
var voiceHeartbeat = 0;
var voiceUDPServer;
var s = 0;
var audioSequence = 0;
var timestamp = 0;
var logId;
var udpPort;
var udpIP;
var udpSsrc;
var voiceHeartbeatInterval;
var token = "";
var gatewaySocket = {};
var voiceSocket = {};
var voiceUDPConnection = {};
var guilds = {};
var voiceData = [];
var user = {};
var logger = bunyan.createLogger({
  name: "defaultLogger",
  streams: [
    {
      stream: process.stdout,
      level: "debug"
    },
    {
      stream: process.stdout,
      level: "info"
    },
    {
      stream: process.stdout,
      level: "error"
    }
  ]
});
var chat = {
  sendMessage: sendMessage,
  deleteMessage: deleteMessage,
  registerCommand: registerCommand,
  triggerTyping: triggerTyping
};
var voice = {
  joinVoice: joinVoice,
  moveVoice: moveVoice,
  leaveVoice: leaveVoice,
  findChannelOfUser: findChannelOfUser
};

class DiscordStream extends stream.Writable {
  constructor(options) {
    super(options);
  }

  _write(chunk, encoding, callback) {
  }
}

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
  registerLogChannel: registerLogChannel,
  chat: chat,
  voice: voice,
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
    processPayload(data)
  });
}

function getGateway(failed) {
  var cacheValue = cache.cache;
  console.log(cacheValue);
  console.log(!failed && cacheValue.gateway !== undefined);
  if (!failed && cacheValue.gateway !== undefined) {
  } else {
    console.log("Gateway cache invalid");
    var gatewayUrl = "";

    var gatewayGetReq = https.request({
      hostname: "discordapp.com",
      path: "/api/gateway"
    }, function (res) {
      console.log('statusCode: ', res.statusCode);

      res.on('data', function (d) {
        gatewayUrl = JSON.parse(d.toString("utf8")).url;

        console.log("Got new gateway URL: " + gatewayUrl);
      });
    });

    gatewayGetReq.end();
  }
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

//GUILDS
eventEmitter.on('guildCreate', function (d) {
  voiceData = d.voice_states;
});

//CHAT
function sendMessage(content, channel) {
  sendHTTPRequest("/channels/" + channel + "/messages", "POST", {
    content: content
  });
}

function deleteMessage(id, channel) {
  sendHTTPRequest("/channels/" + channel + "/messages/" + id, "DELETE");
}

function triggerTyping(channel) {
  sendHTTPRequest("/channels/" + channel + "/typing", "POST");
}

function registerCommand(command, response) {
  eventEmitter.on('messageCreate', function (d) {
    var msg = d.content;
    var args = msg.split(" ");

    if (args[0] == command) {
      if (typeof response === 'function') {
        args.splice(0, 1);

        var rawArgs = "";

        for (var arg in args) {
          arg = args[arg];

          rawArgs = rawArgs + " " + arg
        }

        rawArgs = rawArgs.slice(1, msg.length);

        response(args, d.channel_id, rawArgs, d);
      } else {
        sendMessage(response, d.channel_id);
      }
    }
  });
}

//VOICE
eventEmitter.on('voiceStateUpdate', function (d) {
  if (d.user_id !== user.id) {
    var userPosition = voiceData.indexOf(voiceData.filter(function (obj) {
      return obj.user_id = d.user_id
    })[0]);

    voiceData[userPosition] = d;
  }
});

function sendVoicePayload(op, data) {
  voiceSocket.send(JSON.stringify({
    op: op,
    d: data
  }));
}

function joinVoice(guild, channel) {
  var voiceConnectionPayload = {};
  var voiceServer;

  console.log("Joining voice");

  sendGatewayPayload(4, {
    guild_id: guild,
    channel_id: channel,
    self_mute: false,
    self_deaf: false
  });

  eventEmitter.once('voiceStateUpdate', function (d) {
    if (d.user_id === user.id && d.channel_id !== null) voiceConnectionPayload.session_id = d.session_id.toString();
  });

  eventEmitter.once('voiceServerUpdate', function (d) {
    voiceConnectionPayload.token = d.token.toString();
    voiceConnectionPayload.server_id = d.guild_id.toString();

    voiceUDPServer = d.endpoint.split(":")[0];
    voiceServer = "wss://" + voiceUDPServer;

    if (voiceConnectionPayload.session !== null) connectToVoice(voiceServer, voiceConnectionPayload);
  });
}

function connectToVoice(server, payload) {
  voiceSocket = new WebSocket(server);

  voiceSocket.on('open', function () {
    console.log("Connected to voice server: " + server);

    payload.user_id = user.id.toString();
    sendVoicePayload(0, payload);
  });

  voiceSocket.on('error', function (e) {
    console.error("WS Error: " + e);
  });

  voiceSocket.on('message', function (data) {
    if (data instanceof Buffer) {
      try {
        data = zlib.inflateSync(data).toString();
      } catch (e) {
        console.error("Data Parse Error: " + e)
      }
    }

    data = JSON.parse(data);
    eventEmitter.emit('payload', data);

    switch (data.op) {
      case 2:
        eventEmitter.emit('voiceReady', data.d, data);
        break;
      case 4:
        eventEmitter.emit('voiceSessionDescription', data.d, data);
        break;
      case 5:
        eventEmitter.emit('voiceSpeaking', data.d, data);
        break;
    }
  });
}

eventEmitter.on('voiceReady', function (d) {
  voiceHeartbeat = d.heartbeat_interval;

  voiceHeartbeatInterval = setInterval(function () {
    try {
      sendVoicePayload(3, null);
    } catch (e) {
      console.error("Error sending heartbeat: " + e);
    }
  }, voiceHeartbeat);

  connectToUDP(voiceUDPServer, d.port, d.ssrc, d);
});

function connectToUDP(server, port, ssrc, d) {
  var discoveredIP = "";
  var discoveredPort;

  voiceUDPConnection = udp.createSocket("udp4");
  voiceUDPConnection.bind({exclusive: true});
  voiceUDPConnection.once('message', function (msg, rinfo) {
    var buffArr = JSON.parse(JSON.stringify(msg)).data;
    for (var i = 4; i < buffArr.indexOf(0, i); i++) {
      discoveredIP += String.fromCharCode(buffArr[i]);
    }
    discoveredPort = msg.readUIntLE(msg.length - 2, 2).toString(10);

    sendVoicePayload(1, {
      "protocol": "udp",
      "data": {
        "address": discoveredIP,
        "port": Number(discoveredPort),
        "mode": d.modes[1] //'xsalsa20_poly1305'
      }
    });
  });

  var identifyPacket = new Buffer(70);
  identifyPacket.writeUIntBE(ssrc, 0, 4);
  voiceUDPConnection.send(identifyPacket, 0, identifyPacket.length, port, server, function (err) {
    if (err) console.log(err);
  });

  udpIP = server;
  udpPort = port;
  udpSsrc = ssrc;
}

eventEmitter.on('voiceSessionDescription', function (d) {
  var secretKey = d.secret_key;
  var startTime;
  var opusEncoder = new Opus.OpusEncoder(48000, 2);

  var VoicePacket = (function () {
    var header = new Buffer(12),
      nonce = new Buffer(24),
      output = new Buffer(2048);

    header[0] = 0x80;
    header[1] = 0x78;
    header.writeUIntBE(udpSsrc, 8, 4);

    nonce.fill(0);

    return function (packet, sequence, timestamp, key) {
      header.writeUIntBE(sequence, 2, 2);
      header.writeUIntBE(timestamp, 4, 4);
      //<Buffer 80 78 00 01 00 00 03 c0 00 00 00 01>
      header.copy(nonce);
      //<Buffer 80 78 00 01 00 00 03 c0 00 00 00 01 00 00 00 00 00 00 00 00 00 00 00 00>

      var encrypted = new Buffer(
        nacl.secretbox(
          new Uint8Array(packet),
          new Uint8Array(nonce),
          new Uint8Array(key)
        )
      );

      header.copy(output);
      encrypted.copy(output, 12);

      return output.slice(0, header.length + encrypted.length);
    };
  })();

  function sendAudio(stream) {
    sendVoicePayload(5, {
      speaking: true,
      delay: 0
    });

    startTime = new Date().getTime();
    sendPacket(stream, 1);
  }

  function sendPacket(stream, cnt) {
    var buff, encoded, audioPacket, nextTime;

    buff = stream.read(3840);
    if (stream.destroyed) return;

    audioSequence = audioSequence < 0xFFFF ? audioSequence + 1 : 0;
    timestamp = timestamp < 0xFFFFFFFF ? timestamp + 960 : 0;

    encoded = [0xF8, 0xFF, 0xFE];
    if (buff && buff.length === 3840) encoded = opusEncoder.encode(buff);

    audioPacket = VoicePacket(encoded, audioSequence, timestamp, secretKey);
    nextTime = startTime + cnt * 20;

    try {
      //It throws a synchronous error if it fails (someone leaves the audio channel while playing audio)
      voiceUDPConnection.send(audioPacket, 0, audioPacket.length, udpPort, udpIP, function (err) {
        if (err) {
          console.log(err);
        }
      });
    } catch (e) {
      return;
    }
    return setTimeout(function () {
      return sendPacket(stream, cnt + 1);
    }, 20 + (nextTime - new Date().getTime()));
  }

  console.log("Ready to send voice");

  eventEmitter.emit('voiceTransmissionReady', sendAudio);
});

function moveVoice(guild, channel) {
  sendGatewayPayload(4, {
    guild_id: guild,
    channel_id: channel,
    self_mute: false,
    self_deaf: false
  });
}

function leaveVoice(guild) {
  sendGatewayPayload(4, {
    guild_id: guild,
    channel_id: null,
    self_mute: false,
    self_deaf: false
  });

  clearInterval(voiceHeartbeatInterval);
  voiceSocket.close();
}

function findChannelOfUser(userId) {
  for (var user in voiceData) {
    user = voiceData[user];

    if (user.user_id == userId) return user.channel_id;
  }
}

function registerLogChannel(id) {
  logId = id;
}