"use strict";
var https = require("https");
var WebSocket = require('ws');
var EventEmitter = require('events');
var zlib = require("zlib");

class User {
  var id;
  var username;
  var discriminator;
  var avatar;
  var bot;
  var mfa_enabled;
  var verified;
  var email;

  constructor(id, username, discriminator, avatar, bot, mfa_enabled, verified, email) {
    this.id = id;
    this.username = username;
    this.discriminator = discriminator;
    this.avatar = avatar;
    this.bot = bot;
    this.mfa_enabled = mfa_enabled;
    this.verified = verified;
    this.email = email;
  }
}

class Guild {
  var id;
  var name;
  var icon;
  var splash;
  var ownerId;
  var region;
  var afkChannelId;
  var afkTimeout;
  var embedEnabled;
  var embedChannelId;
  var verificationLevel;
  var voiceStates;
  var roles;
  var emojis;
  var features;
  var unavailable;
  var members;
  var presences;
  var channels;

  constructor(id, name, icon, splash, ownerId, region, afkChannelId, afkTimeout, embedEnabled, embedChannelId, verificationLevel, voiceStates, roles, emojis, features, unavailable, members, presences, channels) {
    this.id = id;
    this.name = name;
    this.icon = icon;
    this.splash = splash;
    this.ownerId = ownerId;
    this.region = region;
    this.afkChannelId = afkChannelId;
    this.afkTimeout = afkTimeout;
    this.embedEnabled = embedEnabled;
    this.embedChannelId = embedChannelId;
    this.verificationLevel = verificationLevel;
    this.voiceStates = voiceStates;
    this.roles = roles;
    this.emojis = emojis;
    this.features = features;
    this.unavailable = unavailable;
    this.members = members;
    this.presences = presences;
    this.channels = channels;
  }
}

class GuildChannel {
  var id;
  var guildId;
  var name;
  var type;
  var position;
  var isPrivate;
  var permissionOverwrites;
  var topic;
  var lastMessageId;
  var bitrate;
  var userLimit;

  constructor(id, guildId, name, type, position, isPrivate, permissionOverwrites, channelSpecific1, channelSpecific2) {
    this.id = id;
    this.guildId = guildId;
    this.name = name;
    this.type = type;
    this.position = position;
    this.isPrivate = isPrivate;
    this.permissionOverwrites = permissionOverwrites;
    if (type == "text") {
      this.topic = channelSpecific1;
      this.lastMessageId = channelSpecific2;
    } else {
      this.bitrate = channelSpecific1;
      this.userLimit = channelSpecific2;
    }
  }
}

class DMChannel {
  var id;
  var isPrivate;
  var recipient;
  var lastMessageId;

  constructor(id, isPrivate, recipient, lastMessageId) {
    this.id = id;
    this.isPrivate = isPrivate;
    this.recipient = recipient;
    this.lastMessageId = lastMessageId;
  }
}

class Message {
  var id;
  var channelId;
  var author;
  var content;
  var timestamp;
  var editedTimestamp;
  var tts;
  var mentionEveryone;
  var mentions;
  var mentionRoles;
  var attachments;
  var embeds;

  constructor(id, channelId, author, content, timestamp, editedTimestamp, tts, mentionEveryone, mentions, mentionRoles, attachments, embeds) {
    this.id = id;
    this.channelId = channelId;
    this.author = author;
    this.content = content;
    this.timestamp = timestamp;
    this.editedTimestamp = editedTimestamp;
    this.tts = tts;
    this.mentionEveryone = mentionEveryone;
    this.mentions = mentions;
    this.mentionRoles = mentionRoles;
    this.attachments = attachments;
    this.embeds = embeds;
  }
}

class VoiceState {
  var channelId;
  var userId;
  var sessionId;
  var deaf;
  var mute;
  var selfDeaf;
  var selfMute;
  var suppress;

  constructor(channelId, userId, sessionId, deaf, mute, selfDeaf, selfMute, suppress) {
    this.channelId = channelId;
    this.userId = userId;
    this.sessionId = sessionId;
    this.deaf = deaf;
    this.mute = mute;
    this.selfDeaf = selfDeaf;
    this.selfMute = selfMute;
    this.suppress = suppress;
  }
}

class Role {
  var position;
  var permissions;
  var name;
  var mentionable;
  var managed;
  var id;
  var hoist;
  var color;

  constructor(position, permissions, name, mentionable, managed, id, hoist, color) {
    this.position = position;
    this.permissions = permissions;
    this.name = name;
    this.mentionable = mentionable;
    this.managed = managed;
    this.id = id;
    this.hoist = hoist;
    this.color = color;
  }
}

class BotInstance extends EventEmitter {
  var token;
  var gatewaySocket;
  var s;
  var user;
  var guilds;
  var dmChannels;

  constructor(token, name) {
    this.token = token;

    this.gatewaySocket = new WebSocket("wss://gateway.discord.gg");

    this.gatewaySocket.on('open', function () {
      console.log("Connected to gateway");

      this.sendGatewayPayload(2, {
        token: token,
        v: 5,
        encoding: "json",
        compress: true,
        large_threshold: 250,
        properties: {
          "$os": name,
          "$browser": name,
          "$device": name,
          "$referrer": name,
          "$referring_domain": name
        }
      })
    });

    this.gatewaySocket.on('error', function (e) {
      console.error("WS Error: " + e);
    });

    this.gatewaySocket.on('message', function (data) {
      this.processPayload(data)
    });

    this.setupListeners();
  }

  private convertUser(rawUser) {
    return new User(rawUser.id, rawUser.username, rawUser.discriminator, rawUser.avatar, rawUser.bot, rawUser.mfa_enabled)
  }

  private static convertGuild(rawGuild) {
    if (rawGuild.channels == null) for (var channel in rawGuild.channels) rawGuild.channels[channel] = BotInstance.convertGuildChannel(rawGuild.channels[channel]);
    if (rawGuild.members == null) for (var member in rawGuild.members) rawGuild.members[member] = this.convertUser(rawGuild.members[member]);

    for (var voiceState in rawGuild.voice_states) rawGuild.voice_states[voiceState] = this.convertVoiceState(rawGuild.voice_states[voiceState]);

    return new Guild(rawGuild.id, rawGuild.name, rawGuild.icon, rawGuild.splash, rawGuild.owner_id, rawGuild.region,
      rawGuild.afk_channel_id, rawGuild.afk_timeout, rawGuild.embed_enabled, rawGuild.embed_channel_id, rawGuild.verification_level, rawGuild.voice_states, rawGuild.roles, rawGuild.emojis, rawGuild.features, rawGuild.available);
  }

  private static convertUnknownChannel(rawChannel) {
    if (rawChannel.is_private) return BotInstance.convertDMChannel(rawChannel);
    else return BotInstance.convertGuildChannel(rawChannel);
  }

  private static convertDMChannel(rawChannel) {
    return new DMChannel(rawChannel.id, rawChannel.is_private, rawChannel.recipient, rawChannel.last_message_id);
  }

  private static convertGuildChannel(rawChannel) {
    if (rawChannel.type == "text") return new GuildChannel(rawChannel.id, rawChannel.guild_id, rawChannel.name, rawChannel.type, rawChannel.position, rawChannel.is_private, rawChannel.permession_overwrites, rawChannel.topic, rawChannel.last_message_id);
    else return new GuildChannel(rawChannel.id, rawChannel.guild_id, rawChannel.name, rawChannel.type, rawChannel.position, rawChannel.is_private, rawChannel.permession_overwrites, rawChannel.bitrate, rawChannel.user_limit);
  }

  private static convertMessage(rawMessage) {
    return new Message(rawMessage.id, rawMessage.channel_id, rawMessage.author, rawMessage.content, rawMessage.timestamp, rawMessage.edited_timestamp, rawMessage.tts, rawMessage.mention_everyone, rawMessage.mentions, rawMessage.mention_roles, rawMessage.attachments, rawMessage.embeds)
  }

  private static convertVoiceState(rawVoiceState) {
    return new VoiceState(rawVoiceState.channel_id, rawVoiceState.user_id, rawVoiceState.session_id, rawVoiceState.deaf, rawVoiceState.mute, rawVoiceState.self_deaf , rawVoiceState.self_mute, rawVoiceState.suppress)
  }

  private static convertRole(rawRole) {}

  private sendHTTPPayload(path, method, data, cb) {
    var req = https.request({
      hostname: "discordapp.com",
      path: "/api" + path,
      method: method,
      headers: {
        'Authorization': thisr.token,
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

  private sendGatewayPayload(op, data) {
    this.gatewaySocket.send(JSON.stringify({
      op: op,
      d: data
   }));
  }

  private processPayload(data) {
    if (data instanceof Buffer) {
      try {
        data = zlib.inflateSync(data).toString();
      } catch (e) {
        console.error("Data Parse Error: " + e)
      }
    }

    data = JSON.parse(data);
    super.emit('payload', data);

    this.s = data.s;

    if (data.op == 0) super.emit('event', data.t, data.d, data);

    switch (data.t) {
      case "READY":
        super.emit('ready', data.d, data);
        break;
      case "RESUMED":
        super.emit('resume', data.d, data);
        break;
      case "GUILD_CREATE":
        super.emit('guildCreate', data.d, data);
        break;
      case "GUILD_UPDATE":
        super.emit('guildUpdate', data.d, data);
        break;
      case "GUILD_DELETE":
        super.emit('guildDelete', data.d, data);
        break;
      case "CHANNEL_CREATE":
        super.emit('channelCreate', data.d, data);
        break;
      case "CHANNEL_UPDATE":
        super.emit('channelUpdate', data.d, data);
        break;
      case "CHANNEL_DELETE":
        super.emit('channelDelete', data.d, data);
        break;
      case "MESSAGE_CREATE":
        super.emit('messageCreate', data.d, data);
        break;
      case "MESSAGE_UPDATE":
        super.emit('messageUpdate', data.d, data);
        break;
      case "MESSAGE_DELETE":
        super.emit('messageDelete', data.d, data);
        break;
      case "MESSAGE_DELETE_BULK":
        super.emit('messageDeleteBulk', data.d, data);
        break;
      case "GUILD_BAN_ADD":
        super.emit('guildBanAdd', data.d, data);
        break;
      case "GUILD_BAN_REMOVE":
        super.emit('guildBanRemove', data.d, data);
        break;
      case "GUILD_EMOJI_UPDATE":
        super.emit('guildEmojiUpdate', data.d, data);
        break;
      case "GUILD_INTEGRATIONS_UPDATE":
        super.emit('guildIntegrationUpdate', data.d, data);
        break;
      case "GUILD_MEMBER_ADD":
        super.emit('guildMemberAdd', data.d, data);
        break;
      case "GUILD_MEMBER_UPDATE":
        super.emit('guildMemberUpdate', data.d, data);
        break;
      case "GUILD_MEMBER_REMOVE":
        super.emit('guildMemberRemove', data.d, data);
        break;
      case "GUILD_MEMBERS_CHUNK":
        super.emit('guildMembersChunk', data.d, data);
        break;
      case "GUILD_ROLE_CREATE":
        super.emit('guildRoleCreate', data.d, data);
        break;
      case "GUILD_ROLE_UPDATE":
        super.emit('guildRoleUpdate', data.d, data);
        break;
      case "GUILD_ROLE_DELETE":
        super.emit('guildRoleDelete', data.d, data);
        break;
      case "PRESENCE_UPDATE":
        super.emit('presenceUpdate', data.d, data);
        break;
      case "TYPING_START":
        super.emit('typingStart', data.d, data);
        break;
      case "USER_SETTINGS_UPDATE":
        super.emit('userSettingUpdate', data.d, data);
        break;
      case "USER_UPDATE":
        super.emit('userUpdate', data.d, data);
        break;
      case "VOICE_STATE_UPDATE":
        super.emit('voiceStateUpdate', data.d, data);
        break;
      case "VOICE_SERVER_UPDATE":
        super.emit('voiceServerUpdate', data.d, data);
        break;
      default:
        console.error("Unknown event: " + data.t)
    }
  }

  private setupListeners() {
    this.on("ready", function (d) {
      this.user = this.convertUser(d.user);
      for (var guild in d.guilds) this.guilds[guild] = this.convertGuild(d.guilds[guild]);
      for (var dmChannel in d.private_channels) this.dmChannels[dmChannel] = BotInstance.convertDMChannel(d.private_channels[dmChannel]);
    });
    this.on("guildCreate", function (d) {
      d = this.convertGuild(d);
      var guild = this.guilds.filter(function (guild) {
        return guild.guildId == d.guild_id;
      });
      if (guild.length == 0) this.guilds[length] = d;
      else this.guilds[this.guilds.indexOf(g[0])] = d;
    });
    this.on("guildUpdate", function (d) {
      d = this.convertGuild(d);
      var guild = this.guilds.filter(function (guild) {
        return guild.guildId == d.guild_id;
      });
      this.guilds[this.guilds.indexOf(guild[0])] = d;
    });
    this.on("guildDelete", function (d) {
      d = this.convertGuild(d);
      var g = this.guilds.filter(function (guild) {
        return guild.guildId == d.guild_id;
      });
      this.guilds.splice(this.guilds.indexOf(g[0]), 1);
    });
    this.on("channelCreate", function (d) {
      d = BotInstance.convertUnknownChannel(d);
      if (d.isPrivate) {
        this.dmChannels[this.dmChannels.length] = d;
      } else {
        var guild = this.guilds.filter(function (guild) {
          return guild.guildId == d.guildId;
        });
        var guildIndex = this.guilds.indexOf(guild);
        guild[guildIndex].channels[guild[guildIndex].channels.length] = d;
      }
    });
    this.on("channelUpdate", function (d) {
      var channel;
      d = BotInstance.convertUnknownChannel(d);
      if (d.isPrivate) {
        channel = this.dmChannels.filter(function (channel) {
          return channel.id == d.id;
        });
        this.dmChannels[this.dmChannels.indexOf(channel[0])] = d;
      } else {
        var guild = this.guilds.filter(function (guild) {
          return guild.guildId == d.guild_id;
        });
        channel = guild[0].channels.filter(function (channel) {
          return channel.id == d.id;
        });
        this.guilds[this.guilds.indexOf(guild[0])].channels[this.guilds[this.guilds.indexOf(guild[0])].channels.indexOf(channel[0])] = d;
      }
    });
    this.on("channelDelete", function (d) {
      var channel;
      d = BotInstance.convertUnknownChannel(d);
      if (d.isPrivate) {
        channel = this.dmChannels.filter(function (channel) {
          return channel.id == d.id;
        });
        this.dmChannels.splice(this.dmChannels.indexOf(channel[0]), 1);
      } else {
        var guild = this.guilds.filter(function (guild) {
          return guild.guildId == d.guild_id;
        });
        channel = guild[0].channels.filter(function (channel) {
          return channel.id == d.id;
        });
        this.guilds[this.guilds.indexOf(guild[0])].channels.splice(this.guilds[this.guilds.indexOf(guild[0])].channels.indexOf(channel), 1);
      }
    });
    this.on("messageCreate", function (d) {
      var channel;
      d = this.convertMessage(d);
      var guild = this.guilds.filter(function (guild) {
        return guild.guildId == d.guild_id;
      });
      var channel = guild.channels.filter(function (channel) {
        return channel.id == d.channel_id;
      });
      if (channel.length == 0) {
        var channel = this.dmChannels.filter(function (channel) {
          return channel.id == d.channel_id;
        });
      }
      channel.lastMessageId = d.id;
    });
  }
}