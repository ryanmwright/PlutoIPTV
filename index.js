#!/usr/bin/env node

const request = require('request');
const j2x = require('jsontoxml');
const moment = require('moment');
const fs = require('fs-extra');
const uuid4 = require('uuid').v4;
const uuid1 = require('uuid').v1;
const url = require('url');
const favorites = require('./favorites');
let channelTransformer = {
  computeChannelNumber: function(channel) { return channel.number },
  transformPlaylistUrl: function(m3uUrl, channel) { return m3uUrl }
};
try { channelTransformer = require('./channeltransformer'); } catch { }
const cacheTime = 30 * 60;
const cacheFile = "/tmp/pluto-cache.json";

const plutoIPTV = {
  grabJSON: function (callback) {
    callback = callback || function () {};

    console.log('[INFO] Grabbing EPG...');

    // check for cache
    if (fs.existsSync(cacheFile)) {
      let stat = fs.statSync(cacheFile);

      let now = new Date() / 1000;
      let mtime = new Date(stat.mtime) / 1000;

      // it's under 30 mins old
      if (now - mtime <= cacheTime) {
        console.log(`[DEBUG] Using cache.json, it's under ${cacheTime / 60} minutes old.`);

        callback(false, fs.readJSONSync(cacheFile));
        return;
      }
    }

    // 2020-03-24%2021%3A00%3A00.000%2B0000
    let startTime = encodeURIComponent(
      moment().format('YYYY-MM-DD HH:00:00.000ZZ')
    );

    // 2020-03-25%2005%3A00%3A00.000%2B0000
    let stopTime = encodeURIComponent(
      moment().add(48, 'hours').format('YYYY-MM-DD HH:00:00.000ZZ')
    );

    let url = `http://api.pluto.tv/v2/channels?start=${startTime}&stop=${stopTime}`;

    console.log(url);

    request(url, function (err, code, raw) {
      console.log('[DEBUG] Using api.pluto.tv, writing cache.json.');
      fs.writeFileSync(cacheFile, raw);

      callback(err || false, JSON.parse(raw));
      return;
    });
  },
};

module.exports = plutoIPTV;

plutoIPTV.grabJSON(function (err, channels) {

  /////////////////////
  // Filter Channels //
  /////////////////////
  const favoritesPath = './pluto-favorites';
  const favoritesFilter = favorites.from(favoritesPath);
  if(!favoritesFilter.isEmpty()) {
    channels = channels.filter(favoritesFilter);
    favoritesFilter.printSummary();
  } else {
    console.log(`[DEBUG] No favorites specified (${favoritesPath}), loading all channels.`)
  }

  ///////////////////
  // M3U8 Playlist //
  ///////////////////

  let m3u8 = `#EXTM3U
`;
  channels.forEach((channel) => {
    let deviceId = uuid1();
    let sid = uuid4();
    if (channel.isStitched) {
      let m3uUrl = new URL(channel.stitched.urls[0].url);
      let queryString = url.search;
      let params = new URLSearchParams(queryString);

      // set the url params
      params.set('advertisingId', '');
      params.set('appName', 'web');
      params.set('appVersion', 'unknown');
      params.set('appStoreUrl', '');
      params.set('architecture', '');
      params.set('buildVersion', '');
      params.set('clientTime', '0');
      params.set('deviceDNT', '0');
      params.set('deviceId', deviceId);
      params.set('deviceMake', 'Chrome');
      params.set('deviceModel', 'web');
      params.set('deviceType', 'web');
      params.set('deviceVersion', 'unknown');
      params.set('includeExtendedEvents', 'false');
      params.set('sid', sid);
      params.set('userId', '');
      params.set('serverSideAds', 'true');

      m3uUrl.search = params.toString();
      m3uUrl = m3uUrl.toString();

      let id = channel._id;
      let channelId = `pluto-${id}`;
      let logo = channel.colorLogoPNG.path;
      let group = channel.category;
      let name = channel.name;
      let channelNumber = channelTransformer.computeChannelNumber(channel);

      m3u8 =
        m3u8 +
        `#EXTINF:-1 channel-id="${channelId}" tvg-id="${id}" tvg-chno="${channelNumber}" tvg-logo="${logo}" group-title="${group}", ${name}
${channelTransformer.transformPlaylistUrl(m3uUrl, channel)}

`;

      console.log('[INFO] Adding ' + channel.name + ' channel.');
    } else {
      console.log("[DEBUG] Skipping 'fake' channel " + channel.name + '.');
    }
  });

  ///////////////////////////
  // XMLTV Programme Guide //
  ///////////////////////////
  let tv = [];

  //////////////
  // Channels //
  //////////////
  channels.forEach((channel) => {
    if (channel.isStitched) {
      tv.push({
        name: 'channel',
        attrs: { id: channel._id },
        children: [
          { name: 'display-name', text: channel.name },
          { name: 'display-name', text: channelTransformer.computeChannelNumber(channel) },
          { name: 'desc', text: channel.summary },
          { name: 'icon', attrs: { src: channel.colorLogoPNG.path } },
        ],
      });

      //////////////
      // Episodes //
      //////////////
      if (channel.timelines) {
        channel.timelines.forEach((programme) => {
          console.log(
            '[INFO] Adding instance of ' +
              programme.title +
              ' to channel ' +
              channel.name +
              '.'
          );

          tv.push({
            name: 'programme',
            attrs: {
              start: moment(programme.start).format('YYYYMMDDHHmmss ZZ'),
              stop: moment(programme.stop).format('YYYYMMDDHHmmss ZZ'),
              channel: channel._id,
            },
            children: [
              { name: 'title', attrs: { lang: 'en' }, text: programme.title },
              {
                name: 'sub-title',
                attrs: { lang: 'en' },
                text:
                  programme.title == programme.episode.name
                    ? ''
                    : programme.episode.name,
              },
              {
                name: 'desc',
                attrs: { lang: 'en' },
                text: programme.episode.description,
              },
              {
                name: 'date',
                text: moment(programme.episode.firstAired).format('YYYYMMDD'),
              },
              {
                name: 'category',
                attrs: { lang: 'en' },
                text: programme.episode.genre,
              },
              {
                name: 'category',
                attrs: { lang: 'en' },
                text: programme.episode.subGenre,
              },
              {
                name: 'category',
                attrs: { lang: 'en' },
                text: programme.episode.series.type,
              },
              {
                name: 'category',
                attrs: { lang: 'en' },
                text: channel.category,
              },
              {
                name: 'episode-num',
                attrs: { system: 'onscreen' },
                text: programme.episode.number,
              },
              {
                name: 'icon',
                attrs: { src: programme.episode.poster.path},
              },
            ],
          });
        });
      }
    }
  });

  let epg = j2x(
    { tv },
    {
      prettyPrint: true,
      escape: true,
    }
  );

  const now = new Date();
  const utcMilllisecondsSinceEpoch = now.getTime() + (now.getTimezoneOffset() * 60 * 1000);
  const utcSecondsSinceEpoch = Math.round(utcMilllisecondsSinceEpoch / 1000);

  const epgFile = '/etc/pluto-iptv.d/pluto-epg.xml';
  const playlistFile = '/etc/pluto-iptv.d/pluto-playlist.m3u8';

  // Barf. This is the easiest way to get the XML library to add this to the root object
  fs.writeFileSync(epgFile, epg.replace("<tv>", `<tv generated-ts="${utcSecondsSinceEpoch}">`));
  console.log(`[SUCCESS] Wrote the EPG to ${epgFile}!`);

  fs.writeFileSync(playlistFile, m3u8);
  console.log(`[SUCCESS] Wrote the M3U8 tuner to ${playlistFile}!`);
});
